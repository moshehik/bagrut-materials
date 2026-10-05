import { NextResponse, after, type NextRequest } from "next/server";
import JSZip from "jszip";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, downloads, materials, type Material } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement, getDescendantIds, getCategoryChain, chainToHref, getUserDownloadCounts } from "@/lib/data";
import { stampPdf, stampImage } from "@/lib/watermark";
import { logAudit, requestMeta } from "@/lib/audit";
import { fetchFile } from "@/lib/file-source";
import { isOfficeMime, convertOfficeToPdfCached, driveIdFromUrl, isDriveConfigured } from "@/lib/driveBridge";
import { contentDisposition } from "@/lib/http-utils";
import { markDownloadReady } from "@/lib/download-ready";
import {
  dailyRemaining,
  reserveDownloads,
  subscriptionRemaining,
  type EntitlementOk,
  type Reservation,
  type ReserveResult,
} from "@/lib/download-quota";
import { officeMimeFor } from "@/lib/office-mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// המרת כמה קבצי Word ל-PDF במקביל דרך Drive
export const maxDuration = 300;

const CONCURRENCY = 4;
/** תקרה קשיחה לקבצים בזיפ אחד – ההמרה ל-PDF לוקחת 10-20 שניות לקובץ, ו-maxDuration הוא 300 שניות */
const FOLDER_MAX_FILES = 40;

/** שם רשומה בזיפ: בלי תווי נתיב (/ \) ובלי ".." – שלא ייכתב מחוץ לתיקיית החילוץ */
function safeEntryName(fileName: string) {
  const cleaned = fileName.replace(/[\\/]/g, "_").replace(/\.{2,}/g, "_").trim();
  return cleaned || "file";
}

function stem(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
function ext(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot) : "";
}

type Who = { personalCode: string; name: string; email: string; phone: string | null };

/**
 * מכינה קובץ אחד לזיפ: אותה לוגיקה כמו /api/download/[id] – המרת Office ל-PDF + הטבעת מספר אישי.
 * null = נכשל. למשתמשת רגילה כשל בהמרה/הטבעה = כשל (לא שולחים מקור בלי סימן מים); למנהלת – המקור.
 */
async function prepare(m: Material, u: Who, isAdmin: boolean): Promise<{ name: string; bytes: Uint8Array } | null> {
  const file = await fetchFile(m.fileUrl);
  if (!file) return null;
  const stampInfo = { personalCode: u.personalCode, userName: u.name, email: u.email, phone: u.phone };
  const isOffice = isOfficeMime(m.mime) || /\.(docx?|pptx?)$/i.test(m.fileName);
  const isPdf =
    !isOffice &&
    (m.mime === "application/pdf" ||
      m.fileName.toLowerCase().endsWith(".pdf") ||
      (file.contentType ?? "").startsWith("application/pdf"));
  const isImage = /^image\/(png|jpe?g)$/.test(file.contentType ?? m.mime ?? "");
  const raw = new Uint8Array(await new Response(file.stream).arrayBuffer());
  const tag = u.personalCode;
  const safe = safeEntryName(m.fileName);
  const original = { name: `${stem(safe)}-${tag}${ext(safe)}`, bytes: raw };
  // מנהלת בלבד מקבלת את המקור כשההמרה/ההטבעה נכשלו
  const fallback = (stage: string, e: unknown) => {
    console.error(`folder zip: ${stage} failed`, m.id, e);
    return isAdmin ? original : null;
  };

  if (isOffice && isDriveConfigured()) {
    try {
      const pdf = await convertOfficeToPdfCached({ bytes: raw, mimeType: officeMimeFor(m.mime, m.fileName), name: m.fileName, fileId: driveIdFromUrl(m.fileUrl), defer: after });
      return { name: `${stem(safe)}-${tag}.pdf`, bytes: await stampPdf(pdf, stampInfo) };
    } catch (e) {
      return fallback("office->pdf", e);
    }
  }
  if (isPdf) {
    try {
      return { name: `${stem(safe)}-${tag}.pdf`, bytes: await stampPdf(raw, stampInfo) };
    } catch (e) {
      return fallback("pdf stamp", e);
    }
  }
  if (isImage) {
    try {
      return { name: original.name, bytes: await stampImage(raw, { personalCode: tag }) };
    } catch (e) {
      return fallback("image stamp", e);
    }
  }
  return original;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const origin = req.nextUrl.origin;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/api/download-folder/${categoryId}`)}`, origin));
  }
  const isAdmin = user.role === "admin";

  // תיעוד סירוב הורדת תיקייה (לא זורק)
  const deny = (reason: string, extra?: Record<string, unknown>) =>
    logAudit({
      actorId: user.id,
      action: "download.denied",
      entityType: "category",
      entityId: categoryId,
      details: { reason, ...extra },
    });

  if (user.suspended) {
    await deny("user_suspended");
    return NextResponse.redirect(new URL("/login?suspended=1", origin));
  }

  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!cat) return NextResponse.json({ error: "not found" }, { status: 404 });
  const chain = await getCategoryChain(categoryId);
  const here = chainToHref(chain);

  if (!user.phone && !isAdmin) {
    await deny("no_phone");
    return NextResponse.redirect(
      new URL(`/account/phone?next=${encodeURIComponent(`/api/download-folder/${categoryId}`)}`, origin),
    );
  }

  const ids = await getDescendantIds(categoryId);
  const all = ids.length
    ? await db
        .select()
        .from(materials)
        .where(inArray(materials.categoryId, ids))
        .orderBy(asc(materials.categoryId), asc(materials.id))
    : [];
  const candidates = all.filter((m) => (m.status === "active" || isAdmin) && (m.allowDownload || isAdmin));

  const ents = await Promise.all(candidates.map((m) => checkEntitlement(user, m)));
  const entOf = new Map<number, EntitlementOk>();
  candidates.forEach((m, i) => {
    const e = ents[i];
    if (e.ok) entOf.set(m.id, e);
  });
  const owned = candidates.filter((m) => entOf.has(m.id));
  if (owned.length === 0) {
    // אין הרשאה לאף קובץ – מפנים לרכישת התיקייה
    await deny("no_entitlement", { candidates: candidates.length });
    return NextResponse.redirect(new URL(`/checkout?bundle=${categoryId}`, origin));
  }

  // כמה קבצים מותר בזיפ הזה: תקרה קשיחה, ולמשתמשת רגילה גם המכסה היומית שנותרה,
  // המגבלה לחומר (max_downloads_per_user) ומכסת המנוי. אם התיקייה גדולה מזה – שגיאה ברורה
  // ולא זיפ חלקי בשקט (אי אפשר לצרף הודעה לזיפ, והמשתמשת לא תדע מה חסר).
  let allowed: Material[] = owned.slice(0, FOLDER_MAX_FILES);
  const limitsHit: string[] = [];
  if (owned.length > FOLDER_MAX_FILES) limitsHit.push(`עד ${FOLDER_MAX_FILES} קבצים בהורדת תיקייה אחת`);
  if (!isAdmin) {
    try {
      // מגבלה לחומר – קבצים שכבר הורדו עד התקרה שלהם נופלים
      const counts = await getUserDownloadCounts(user.id, allowed.map((m) => m.id));
      const beforeMax = allowed.length;
      allowed = allowed.filter((m) => {
        const max = m.maxDownloadsPerUser;
        return max === null || max <= 0 || (counts.get(m.id) ?? 0) < max;
      });
      if (allowed.length < beforeMax) limitsHit.push("קבצים שכבר הורדו את מספר הפעמים המותר");

      // מכסת מנוי – לכל מנוי בנפרד
      const subRemaining = new Map<number, number | null>();
      const kept: Material[] = [];
      let subCut = false;
      for (const m of allowed) {
        const e = entOf.get(m.id)!;
        if (e.via === "subscription" && e.purchaseId) {
          if (!subRemaining.has(e.purchaseId)) subRemaining.set(e.purchaseId, await subscriptionRemaining(e.purchaseId));
          const left = subRemaining.get(e.purchaseId)!;
          if (left !== null) {
            if (left <= 0) {
              subCut = true;
              continue;
            }
            subRemaining.set(e.purchaseId, left - 1);
          }
        }
        kept.push(m);
      }
      if (subCut) limitsHit.push("מכסת ההורדות שנותרה במנוי");
      allowed = kept;

      // מכסה יומית
      const daily = await dailyRemaining(user);
      if (daily !== null && allowed.length > daily) {
        limitsHit.push(`המכסה היומית (נותרו ${daily})`);
        allowed = allowed.slice(0, daily);
      }
    } catch (e) {
      console.error("folder download limit check failed", e);
      await deny("limit_check_failed");
      return NextResponse.json({ error: "לא ניתן לבדוק את מכסת ההורדות כרגע, נסי שוב בעוד רגע" }, { status: 503 });
    }
  }
  if (allowed.length < owned.length) {
    await deny("folder_capped", { owned: owned.length, allowed: allowed.length, limitsHit });
    const why = limitsHit.length ? ` (${limitsHit.join("; ")})` : "";
    const error =
      allowed.length === 0
        ? `לא ניתן להוריד כעת אף קובץ מהתיקייה${why}.`
        : `בתיקייה ${owned.length} קבצים להורדה, אך כרגע מותר להוריד רק ${allowed.length} מהם${why}. אפשר להוריד תת-תיקיות קטנות יותר או קבצים בודדים.`;
    return NextResponse.json({ error, owned: owned.length, allowed: allowed.length }, { status: 403 });
  }

  // הזמנת המכסה לכל הקבצים לפני ההכנה (אטומי; קבצים שייכשלו בהכנה ישוחררו)
  let reservation: Reservation | null = null;
  if (!isAdmin) {
    let r: ReserveResult;
    try {
      const meta = await requestMeta();
      r = await reserveDownloads({
        user,
        items: allowed.map((m) => ({ material: m, ent: entOf.get(m.id)! })),
        kind: "download",
        meta,
      });
    } catch (e) {
      console.error("folder download quota reserve failed", e);
      await deny("limit_check_failed");
      return NextResponse.json({ error: "לא ניתן לבדוק את מכסת ההורדות כרגע, נסי שוב בעוד רגע" }, { status: 503 });
    }
    if (!r.ok) {
      await deny(r.denied.reason, r.denied);
      const error =
        r.denied.reason === "quota"
          ? "מכסת ההורדות במנוי נוצלה"
          : r.denied.reason === "material_limit"
            ? "אחד הקבצים כבר הורד את מספר הפעמים המותר"
            : "המכסה היומית להורדות נוצלה";
      return NextResponse.json({ error }, { status: 403 });
    }
    reservation = r.reservation;
  }
  const release = async (materialIds?: number[]) => {
    if (!reservation) return;
    try {
      await reservation.release(materialIds);
    } catch (e) {
      console.error("folder download quota release failed", e);
    }
  };

  const who: Who = { personalCode: user.personalCode, name: user.name, email: user.email, phone: user.phone };
  type Ready = { name: string; bytes: Uint8Array; m: Material; via: string };
  const results: (Ready | null)[] = new Array(allowed.length).fill(null);
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, allowed.length) }, async () => {
        while (next < allowed.length) {
          const i = next++;
          try {
            const out = await prepare(allowed[i], who, isAdmin);
            if (out) results[i] = { ...out, m: allowed[i], via: entOf.get(allowed[i].id)!.via };
          } catch (e) {
            console.error("folder zip: file failed", allowed[i].id, e);
          }
        }
      }),
    );
  } catch (e) {
    await release();
    throw e;
  }

  const ready = results.filter((r): r is Ready => !!r);
  // קבצים שנכשלו בהכנה (לא התקבלו מהדרייב / המרה נכשלה) ושדולגו (אין הרשאה / לא פעילים)
  const failedIds = allowed.filter((_, i) => !results[i]).map((m) => m.id);
  const skippedIds = all.filter((m) => !owned.includes(m)).map((m) => m.id);
  if (failedIds.length) await release(failedIds);
  if (ready.length === 0) {
    await deny("all_failed", { failedIds });
    return NextResponse.json({ error: "הקבצים אינם זמינים כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }

  let body: Uint8Array;
  try {
    const zip = new JSZip();
    const used = new Set<string>();
    for (const r of ready) {
      let name = r.name;
      if (used.has(name)) name = `${r.m.id}-${name}`;
      used.add(name);
      zip.file(name, r.bytes);
    }
    body = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  } catch (e) {
    await release();
    throw e;
  }

  // תיעוד (שורות downloads ומכסת המנוי כבר נרשמו בהזמנה; למנהלת – נרשמות כאן)
  try {
    if (isAdmin) {
      const { ip, userAgent } = await requestMeta();
      await db.insert(downloads).values(
        ready.map((r) => ({
          userId: user.id,
          materialId: r.m.id,
          watermark: user.personalCode,
          ip,
          userAgent,
          via: r.via,
        })),
      );
    }
    await db
      .update(materials)
      .set({ downloads: sql`${materials.downloads} + 1` })
      .where(inArray(materials.id, ready.map((r) => r.m.id)));
    await logAudit({
      actorId: user.id,
      action: "download",
      entityType: "category",
      entityId: categoryId,
      details: { folder: cat.title, files: ready.length, here, failedIds, skippedIds },
    });
  } catch (e) {
    console.error("folder download log failed", e);
  }

  const res = new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": contentDisposition(`${safeEntryName(cat.title)}.zip`),
      "Cache-Control": "private, no-store",
    },
  });
  return markDownloadReady(req.nextUrl, res);
}
