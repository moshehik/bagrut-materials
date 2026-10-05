import { NextResponse, after, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads, materials } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement } from "@/lib/data";
import { stampPdf, stampImage } from "@/lib/watermark";
import { logAudit, requestMeta } from "@/lib/audit";
import { fetchFile } from "@/lib/file-source";
import { isOfficeMime, convertOfficeToPdfCached, driveIdFromUrl, isDriveConfigured } from "@/lib/driveBridge";
import { contentDisposition } from "@/lib/http-utils";
import { markDownloadReady } from "@/lib/download-ready";
import { applyDocxFixes, isDocxName } from "@/lib/docx-fixes";
import { getPublishedFixes, parseFixesParam } from "@/lib/fixes";
import { reserveDownloads, type Reservation, type ReserveResult } from "@/lib/download-quota";
import { officeMimeFor } from "@/lib/office-mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// המרת Word/PowerPoint ל-PDF דרך Drive לוקחת כ-10-20 שניות; מעל ברירת המחדל של Vercel
export const maxDuration = 60;

function withSuffix(fileName: string, suffix: string) {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName}-${suffix}`;
  return `${fileName.slice(0, dot)}-${suffix}${fileName.slice(dot)}`;
}

function asPdfName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return `${dot > 0 ? fileName.slice(0, dot) : fileName}.pdf`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const materialId = Number(id);
  if (!Number.isInteger(materialId) || materialId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const [material] = await db.select().from(materials).where(eq(materials.id, materialId)).limit(1);
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await getCurrentUser();
  const origin = req.nextUrl.origin;
  const isAdmin = user?.role === "admin";

  // תיעוד סירוב הורדה (לא זורק)
  // אנונימיים (ללא user) לא נרשמים — מניעת הצפת הלוג ע"י בוטים; הניסיון נראה ב-page_views
  const deny = (reason: string, extra?: Record<string, unknown>) =>
    !user ? Promise.resolve() : logAudit({
      actorId: user?.id ?? null,
      action: "download.denied",
      entityType: "material",
      entityId: material.id,
      details: { reason, ...extra },
    });

  if (user?.suspended) {
    await deny("user_suspended");
    return NextResponse.redirect(new URL("/login?suspended=1", origin));
  }
  if (material.status !== "active" && !isAdmin) {
    await deny("material_inactive");
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (material.allowDownload === false && !isAdmin) {
    await deny("view_only");
    return NextResponse.json({ error: "צפייה בלבד" }, { status: 403 });
  }

  const ent = await checkEntitlement(user, material);

  if (!ent.ok) {
    await deny(ent.reason);
    switch (ent.reason) {
      case "login":
        return NextResponse.redirect(
          new URL(`/login?next=${encodeURIComponent(`/api/download/${materialId}`)}`, origin),
        );
      case "premium":
        return NextResponse.redirect(new URL("/checkout?premium=1", origin));
      case "purchase":
        return NextResponse.redirect(new URL(`/checkout?material=${materialId}`, origin));
      default:
        return NextResponse.redirect(new URL(`/pricing?reason=${ent.reason}`, origin));
    }
  }
  // הורדה חופשית ללא התחברות (free_downloads_require_login=false): אין מספר אישי להטביע → מפנים להתחברות
  if (!user) {
    await deny("login");
    return NextResponse.redirect(new URL(`/login?next=/api/download/${id}`, origin));
  }
  const u = user;
  // הטלפון מוטבע בסימן המים - מי שנרשמה לפני שהשדה נוסף / דרך גוגל משלימה אותו קודם
  if (!u.phone && !isAdmin) {
    await deny("no_phone");
    return NextResponse.redirect(
      new URL(`/account/phone?next=${encodeURIComponent(`/api/download/${materialId}`)}`, origin),
    );
  }

  // מגבלות הורדה + הזמנת מכסה (לא חלות על מנהלת): שורת downloads ומכסת המנוי נתפסות
  // אטומית לפני השליחה, ומשוחררות אם השליחה נכשלה לפני שהקובץ יצא. כשל בבדיקה = חסימה, לא אישור.
  let reservation: Reservation | null = null;
  if (!isAdmin) {
    let r: ReserveResult;
    try {
      const meta = await requestMeta();
      r = await reserveDownloads({ user: u, items: [{ material, ent }], kind: "download", meta });
    } catch (e) {
      console.error("download limit check failed", e);
      await deny("limit_check_failed");
      return NextResponse.json({ error: "לא ניתן לבדוק את מכסת ההורדות כרגע, נסי שוב בעוד רגע" }, { status: 503 });
    }
    if (!r.ok) {
      await deny(r.denied.reason, r.denied);
      switch (r.denied.reason) {
        case "material_limit":
          return NextResponse.redirect(new URL("/account?limit=1&material=" + material.id, origin));
        case "quota":
          return NextResponse.redirect(new URL("/pricing?reason=quota", origin));
        default:
          return NextResponse.redirect(new URL("/account?limit=1", origin));
      }
    }
    reservation = r.reservation;
  }
  const release = async () => {
    if (!reservation) return;
    try {
      await reservation.release();
    } catch (e) {
      console.error("download quota release failed", e);
    }
  };

  const file = await fetchFile(material.fileUrl);
  if (!file) {
    await release();
    // רק מזהה הקובץ בדרייב (לא סודות)
    await logAudit({
      actorId: u.id,
      action: "download.file_missing",
      entityType: "material",
      entityId: material.id,
      details: { driveId: material.fileUrl.startsWith("drive://") ? material.fileUrl.slice("drive://".length) : null },
    });
    return NextResponse.json({ error: "הקובץ אינו זמין כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }

  const isOffice = isOfficeMime(material.mime) || /\.(docx?|pptx?)$/i.test(material.fileName);
  const isPdf =
    !isOffice &&
    (material.mime === "application/pdf" ||
      material.fileName.toLowerCase().endsWith(".pdf") ||
      (file.contentType ?? "").startsWith("application/pdf"));
  const isImage = /^image\/(png|jpe?g)$/.test(file.contentType ?? material.mime ?? "");

  // כשל בהמרה/הטבעה: למשתמשת רגילה חוסמים (אין לשלוח מקור בלי סימן מים); למנהלת – המקור, עם תיעוד
  const degraded = async (stage: string) => {
    await logAudit({
      actorId: u.id,
      action: "download.degraded",
      entityType: "material",
      entityId: material.id,
      details: { stage, admin: isAdmin },
    });
    if (isAdmin) return null;
    await release();
    return NextResponse.json({ error: "ההורדה נכשלה, נסי שוב בעוד רגע" }, { status: 502 });
  };

  let response: Response;
  try {
    if (isOffice && isDriveConfigured()) {
      // Word/PowerPoint: תמיד ממירים ל-PDF "לפי דרישה" בכל הורדה (המקור בדרייב
      // לא נוגע בו כלל) ומטביעים את המספר האישי, בדיוק כמו קובץ PDF רגיל.
      let raw = new Uint8Array(await new Response(file.stream).arrayBuffer());
      // ?fixes=all | ?fixes=1,3 – התיקונים שהמורה סימנה בוי: הטקסט המקורי מוחלף בתיקון בנראות רגילה
      // (בלי צבע ובלי מספרים – הסימון הצבעוני קיים רק בצפייה באתר). תיקון שלא סומן לא נוגע בקובץ.
      let fixesApplied = false;
      const wantFixes = parseFixesParam(req.nextUrl.searchParams.get("fixes"));
      if (wantFixes && isDocxName(material.fileName)) {
        try {
          const published = (await getPublishedFixes([material.id])).get(material.id) ?? [];
          const chosen = wantFixes === "all" ? published : published.filter((f) => wantFixes.includes(f.number));
          if (chosen.length > 0) {
            const r = await applyDocxFixes(
              raw,
              chosen.map((f) => ({ id: f.id, originalText: f.originalText, correctedText: f.correctedText })),
            );
            if (r.applied.length > 0) {
              raw = new Uint8Array(r.bytes);
              fixesApplied = true;
            }
          }
        } catch (e) {
          console.error("applying fixes failed, serving original", e);
          await logAudit({
            actorId: u.id,
            action: "download.degraded",
            entityType: "material",
            entityId: material.id,
            details: { stage: "apply_fixes" },
          });
        }
      }
      const baseName = fixesApplied ? withSuffix(material.fileName, "מתוקן") : material.fileName;
      let out: Uint8Array;
      try {
        const pdfBytes = await convertOfficeToPdfCached({
          bytes: raw,
          // מטמון PDF מומר בדרייב (מפתח: קובץ + md5 של התוכן) – חוסך 10-20 שניות המרה
          fileId: driveIdFromUrl(material.fileUrl),
          defer: after,
          // ה-mime שנשמר בחומר לא תמיד של Office (סנכרון דרייב) – נגזר מהסיומת לפני ההמרה
          mimeType: officeMimeFor(material.mime, material.fileName),
          name: material.fileName,
        });
        out = await stampPdf(pdfBytes, {
          personalCode: u.personalCode,
          userName: u.name,
          email: u.email,
          phone: u.phone,
        });
      } catch (e) {
        console.error("office->pdf conversion failed", e);
        const blocked = await degraded("office_to_pdf_or_stamp");
        if (blocked) return blocked;
        out = raw; // מנהלת בלבד
      }
      const converted = out !== raw;
      response = new Response(new Uint8Array(out), {
        headers: {
          "Content-Type": converted ? "application/pdf" : (file.contentType ?? material.mime),
          "Content-Length": String(out.byteLength),
          "Content-Disposition": contentDisposition(
            converted ? withSuffix(asPdfName(baseName), u.personalCode) : withSuffix(baseName, u.personalCode),
          ),
          "Cache-Control": "private, no-store",
        },
      });
    } else if (isPdf) {
      const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
      let out: Uint8Array;
      try {
        out = await stampPdf(bytes, {
          personalCode: u.personalCode,
          userName: u.name,
          email: u.email,
          phone: u.phone,
        });
      } catch (e) {
        // ההטבעה נכשלה (PDF פגום/מוצפן): משתמשת רגילה – חסימה; מנהלת – המקור
        console.error("pdf stamp failed", e);
        const blocked = await degraded("pdf_stamp");
        if (blocked) return blocked;
        out = bytes;
      }
      response = new Response(new Uint8Array(out), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(out.byteLength),
          "Content-Disposition": contentDisposition(withSuffix(material.fileName, u.personalCode)),
          "Cache-Control": "private, no-store",
        },
      });
    } else if (isImage) {
      const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
      let out: Uint8Array;
      try {
        out = await stampImage(bytes, { personalCode: u.personalCode });
      } catch (e) {
        // ההטבעה נכשלה (תמונה פגומה/פורמט לא נתמך): משתמשת רגילה – חסימה; מנהלת – המקור
        console.error("image stamp failed", e);
        const blocked = await degraded("image_stamp");
        if (blocked) return blocked;
        out = bytes;
      }
      response = new Response(new Uint8Array(out), {
        headers: {
          "Content-Type": file.contentType ?? material.mime ?? "application/octet-stream",
          "Content-Length": String(out.byteLength),
          "Content-Disposition": contentDisposition(withSuffix(material.fileName, u.personalCode)),
          "Cache-Control": "private, no-store",
        },
      });
    } else {
      response = new Response(file.stream, {
        headers: {
          "Content-Type": file.contentType ?? material.mime ?? "application/octet-stream",
          "Content-Disposition": contentDisposition(withSuffix(material.fileName, u.personalCode)),
          "Cache-Control": "private, no-store",
        },
      });
    }
  } catch (e) {
    // כשל לא צפוי לפני שהקובץ יצא – משחררים את ההזמנה ומעבירים הלאה
    await release();
    throw e;
  }

  // תיעוד ההורדה (שורת downloads ומכסת המנוי כבר נרשמו בהזמנה; למנהלת – נרשמת כאן)
  try {
    if (isAdmin) {
      const { ip, userAgent } = await requestMeta();
      await db.insert(downloads).values({
        userId: u.id,
        materialId: material.id,
        watermark: u.personalCode,
        ip,
        userAgent,
        via: ent.via,
      });
    }
    await logAudit({
      actorId: u.id,
      action: "download",
      entityType: "material",
      entityId: material.id,
      details: { via: ent.via, title: material.title },
    });
    await db
      .update(materials)
      .set({ downloads: sql`${materials.downloads} + 1` })
      .where(eq(materials.id, material.id));
  } catch (e) {
    console.error("download log failed", e);
  }

  return markDownloadReady(req.nextUrl, response);
}
