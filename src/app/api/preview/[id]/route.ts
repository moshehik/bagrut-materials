import { NextResponse, after, type NextRequest } from "next/server";
import { bytesBody } from "@/lib/stream-bytes";
import { fileRouteError } from "@/lib/http-utils";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { materials } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement } from "@/lib/data";
import { stampPdf, stampPreview, firstPageOnly } from "@/lib/watermark";
import { classifyMaterial } from "@/lib/material-card-types";
import { presentationPreviewMeshFor } from "@/lib/netfree-mode";
import { fetchFile } from "@/lib/file-source";
import { isOfficeMime, convertOfficeToPdfCached, driveIdFromUrl } from "@/lib/driveBridge";
import { logAudit, requestMeta } from "@/lib/audit";
import { applyDocxFixes, isDocxName } from "@/lib/docx-fixes";
import { getFixesForViewer, parseFixesParam, withoutEmbedded } from "@/lib/fixes";
import { decodeDraft } from "@/lib/fix-draft";
import { resolveServedFile } from "@/lib/private-versions";
import { reserveDownloads, type Reservation, type ReserveResult } from "@/lib/download-quota";
import { officeMimeFor } from "@/lib/office-mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * תצוגה מקדימה בדפדפן (inline, לא הורדה):
 * - חומר עם allowPreview=true: עמוד ראשון בלבד, לכל מבקרת (גם לא מחוברת), ללא זיהוי אישי.
 * - משתמשת עם גישה לחומר (גם כשמותר להוריד): המסמך המלא, מוטבע במספר האישי (בדיוק כמו הורדה).
 *   "צפייה בלבד" (allowDownload=false) אומר לא ניתן להוריד, לא שלא ניתן לראות.
 *   צפייה מלאה נספרת בדיוק כמו הורדה (מכסה יומית, מגבלה לחומר, מכסת המנוי) ונרשמת בטבלת
 *   downloads עם via="view:<via>" – אחרת מנויה שנתית יכלה לצפות במקצוע שלם ועדיין "להחליף" אותו
 *   (ההחלפה מותרת רק כל עוד downloadsUsed=0). העמוד הראשון לאורחות נשאר חופשי ולא נספר.
 */
/** הגבלה קלה על תצוגות חיות של נוסח חדש (לכל משתמשת): עד 60 בעשר דקות, בזיכרון השרת */
const draftHits = new Map<number, number[]>();
function draftRateOk(userId: number | undefined): boolean {
  if (!userId) return true;
  const now = Date.now();
  const list = (draftHits.get(userId) ?? []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 60) return false;
  list.push(now);
  draftHits.set(userId, list);
  return true;
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
  const isAdmin = user?.role === "admin";

  // תיעוד סירוב/כשל בתצוגה מקדימה (גם למבקרת אנונימית; לא זורק)
  const fail = (action: "preview.denied" | "preview.failed", reason: string) =>
    logAudit({
      actorId: user?.id ?? null,
      action,
      entityType: "material",
      entityId: material.id,
      details: { reason },
    });

  if (material.status !== "active" && !isAdmin) {
    await fail("preview.denied", "material_inactive");
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ent = await checkEntitlement(user, material);
  // מורה עם גישה לקובץ רואה אותו במלואו באתר (גם אם מותר להוריד) – הכפתור "לצפייה בקובץ" בכרטיסייה
  const fullView = isAdmin || (ent.ok && !!user);

  if (!fullView && !material.allowPreview) {
    await fail("preview.denied", "no_preview_allowed");
    return fileRouteError(req, "אין תצוגה מקדימה לחומר זה", 403);
  }

  const isOffice = isOfficeMime(material.mime) || /\.(docx?|pptx?)$/i.test(material.fileName);
  const isPdfSource =
    !isOffice &&
    (material.mime === "application/pdf" || material.fileName.toLowerCase().endsWith(".pdf"));
  if (!isOffice && !isPdfSource) {
    await fail("preview.denied", "unsupported_type");
    return fileRouteError(req, "אין תצוגה מקדימה לסוג קובץ זה", 400);
  }

  // ?draft=… – תצוגה חיה של נוסח חדש בחלון עריכת השינויים (לפני ששולחים): לא נשמר דבר, ולא נספרת בכל הקלדה כצפייה במכסה
  const rawDraft = fullView ? decodeDraft(req.nextUrl.searchParams.get("draft")) : null;
  const draft = rawDraft && (isAdmin || draftRateOk(user?.id)) ? rawDraft : null;
  if (rawDraft && !draft) return fileRouteError(req, "יותר מדי בקשות תצוגה בזמן קצר, נסי שוב עוד רגע", 429);

  // צפייה מלאה של משתמשת רגילה: הזמנת מכסה (כמו הורדה) לפני ההבאה; משוחררת אם ההצגה נכשלה
  let reservation: Reservation | null = null;
  if (fullView && user && !isAdmin && ent.ok && !draft) {
    let r: ReserveResult;
    try {
      const meta = await requestMeta();
      r = await reserveDownloads({ user, items: [{ material, ent }], kind: "view", meta });
    } catch (e) {
      console.error("preview limit check failed", e);
      await fail("preview.denied", "limit_check_failed");
      return fileRouteError(req, "לא ניתן לבדוק את מכסת הצפיות כרגע, נסי שוב בעוד רגע", 503);
    }
    if (!r.ok) {
      await logAudit({
        actorId: user.id,
        action: "preview.denied",
        entityType: "material",
        entityId: material.id,
        details: { ...r.denied },
      });
      const error =
        r.denied.reason === "quota"
          ? "מכסת ההורדות והצפיות במנוי נוצלה"
          : r.denied.reason === "material_limit"
            ? "החומר הזה כבר הורד/נצפה את מספר הפעמים המותר"
            : r.denied.reason === "period_limit"
              ? "מכסת ההורדות והצפיות ל-30 הימים האחרונים נוצלה"
              : "המכסה היומית להורדות וצפיות נוצלה – נסי שוב מחר";
      return fileRouteError(req, error, 403);
    }
    reservation = r.reservation;
  }
  const release = async () => {
    if (!reservation) return;
    try {
      await reservation.release();
    } catch (e) {
      console.error("preview quota release failed", e);
    }
  };

  // גרסה פרטית מתוקנת של המורה (תלונה כללית שהסוכן תיקן רק עבורה) מוגשת במקום הקובץ המשותף; ?original=1 = המשותף.
  // רק בצפייה מלאה (לאורחת – תמיד המשותף). עוברת את אותו צינור: תיקונים מסומנים, המרה, הטבעה.
  const served = fullView ? await resolveServedFile(material, user, req.nextUrl.searchParams) : { fileUrl: material.fileUrl, privateVersion: null, cacheFileId: driveIdFromUrl(material.fileUrl) };
  const file = await fetchFile(served.fileUrl);
  if (!file) {
    await release();
    await fail("preview.failed", served.privateVersion ? "private_version_missing" : "file_missing");
    return fileRouteError(req, "הקובץ אינו זמין כרגע, נסי שוב מאוחר יותר", 502);
  }
  let raw = new Uint8Array(await new Response(file.stream).arrayBuffer());

  // ?fixes=all | ?fixes=1,3 – הצפייה בשינויים: הדף במלואו, מה שהתבקש לתקן בזהב והתיקון בתכלת, עם מספר ליד כל תיקון.
  // הסימון קיים רק בצפייה באתר; ההורדה (api/download) מחליפה את הטקסט בנראות רגילה.
  const wantFixes = fullView ? parseFixesParam(req.nextUrl.searchParams.get("fixes")) : null;
  if ((wantFixes || draft) && isDocxName(material.fileName)) {
    try {
      const published = (await getFixesForViewer([material.id], user?.id)).get(material.id) ?? [];
      // תיקונים שהסוכן כבר שילב בגרסה הפרטית שלה (embedded) לא מוחלים שוב
      const chosen = !wantFixes ? [] : withoutEmbedded(wantFixes === "all" ? published : published.filter((f) => wantFixes.includes(f.number)));
      // הנוסח החדש שעוד לא נשלח מקבל את המספר הבא ברשימה, כמו שיופיע אחרי השליחה
      const nextNumber = published.reduce((m, f) => Math.max(m, f.number), 0) + 1;
      const toApply = [
        ...chosen.map((f) => ({ id: f.id, originalText: f.originalText, correctedText: f.correctedText, number: f.number, occurrence: f.occurrence })),
        ...(draft ?? []).map((d, i) => ({ id: -(i + 1), originalText: d.q, correctedText: d.c, number: nextNumber + i, occurrence: d.o })),
      ];
      if (toApply.length > 0) {
        const r = await applyDocxFixes(raw, toApply, "marked");
        if (r.applied.length > 0) raw = new Uint8Array(r.bytes);
      }
    } catch (e) {
      console.error("preview: applying marked fixes failed, showing original", e);
    }
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = isOffice
      ? await convertOfficeToPdfCached({
          bytes: raw,
          // מטמון PDF מומר בדרייב (מפתח: קובץ + md5 של התוכן) – חוסך 10-20 שניות המרה; לגרסה פרטית – המפתח שלה
          fileId: served.cacheFileId,
          defer: after,
          // ה-mime שנשמר בחומר לא תמיד של Office (סנכרון דרייב) – נגזר מהסיומת לפני ההמרה
          mimeType: officeMimeFor(material.mime, material.fileName),
          name: material.fileName,
        })
      : raw;
  } catch (e) {
    console.error("preview conversion failed", e);
    await release();
    await fail("preview.failed", "conversion_failed");
    return fileRouteError(req, "לא ניתן להציג תצוגה מקדימה כרגע", 502);
  }

  let out: Uint8Array;
  try {
    out =
      fullView && user
        ? await stampPdf(pdfBytes, { personalCode: user.personalCode, userName: user.name, email: user.email, phone: user.phone }, { behindContent: classifyMaterial(material) === "presentation", mesh: presentationPreviewMeshFor(req) })
        : await stampPreview(await firstPageOnly(pdfBytes));
  } catch (e) {
    console.error("preview stamp failed", e);
    await release();
    await fail("preview.failed", "stamp_failed");
    // לא נופלים חזרה לקובץ המלא והלא־מסומן
    return fileRouteError(req, "לא ניתן להציג תצוגה מקדימה כרגע", 502);
  }

  try {
    await db
      .update(materials)
      .set({ views: sql`${materials.views} + 1` })
      .where(eq(materials.id, material.id));
    // גם מבקרת אנונימית (actorId null) – תצוגה מקדימה ציבורית
    await logAudit({
      actorId: user?.id ?? null,
      action: "preview",
      entityType: "material",
      entityId: material.id,
      details: { title: material.title, fullView, accounted: !!reservation, via: ent.ok ? ent.via : null, privateVersion: served.privateVersion?.id ?? null },
    });
  } catch (e) {
    console.error("preview view log failed", e);
  }

  return new Response(bytesBody(out), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(out.byteLength),
      "Content-Disposition": `inline; filename="preview-${material.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
