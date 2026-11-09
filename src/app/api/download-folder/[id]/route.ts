import { NextResponse, after, type NextRequest } from "next/server";
import JSZip from "jszip";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, downloads, materials, type Material } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement, expandMirrorIds, getDescendantIds,getCategoryChain, chainToHref, getUserDownloadCounts } from "@/lib/data";
import { stampPdf, stampImage } from "@/lib/watermark";
import { logAudit, requestMeta } from "@/lib/audit";
import { fetchFile } from "@/lib/file-source";
import { isOfficeMime, convertOfficeToPdfCached, driveIdFromUrl, isDriveConfigured } from "@/lib/driveBridge";
import { contentDisposition } from "@/lib/http-utils";
import { dlTokenOf, markDownloadReady } from "@/lib/download-ready";
import { sendMail, layoutHtml, siteUrl, templates } from "@/lib/mail";
import { limitKey, rateLimit } from "@/lib/rate-limit";
import {
  dailyRemaining,
  periodRemaining,
  reserveDownloads,
  subscriptionRemaining,
  type EntitlementOk,
  type Reservation,
  type ReserveResult,
} from "@/lib/download-quota";
import { officeMimeFor } from "@/lib/office-mime";
import { getFillLineScale } from "@/lib/user-prefs";
import { classifyMaterial, isVideoMaterial } from "@/lib/material-card-types";
import { netfreeState, presentationMeshFor, type PresentationMesh } from "@/lib/netfree-mode";
import { getPrivateVersion } from "@/lib/private-versions";
import { chooseServedFile } from "@/lib/private-version-logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// המרת כמה קבצי Word ל-PDF במקביל דרך Drive
export const maxDuration = 300;

const CONCURRENCY = 4;
/** תקרה קשיחה לקבצים בזיפ אחד – ההמרה ל-PDF לוקחת 10-20 שניות לקובץ, ו-maxDuration הוא 300 שניות */
const FOLDER_MAX_FILES = 40;
/** תקרת גודל לזיפ שנשלח במייל: Gmail מגביל ל-25MB להודעה, ו-base64 מנפח בכ-33% */
const EMAIL_MAX_ZIP_BYTES = 17 * 1024 * 1024;

/** download = זיפ בתגובה; email = אותו זיפ נשלח למייל של המשתמשת (תשובת JSON) */
type Mode = "download" | "email";

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

type Who = { id: number; personalCode: string; name: string; email: string; phone: string | null };

/**
 * מכינה קובץ אחד לזיפ: אותה לוגיקה כמו /api/download/[id] – המרת Office ל-PDF + הטבעת מספר אישי.
 * null = נכשל. למשתמשת רגילה כשל בהמרה/הטבעה = כשל (לא שולחים מקור בלי סימן מים); למנהלת – המקור.
 * גרסה פרטית מתוקנת של המורה (ר' src/lib/private-versions.ts) נכנסת לזיפ במקום הקובץ המשותף, כמו בהורדה בודדת.
 */
async function prepare(m: Material, u: Who, isAdmin: boolean, mesh: PresentationMesh, fillScale: number): Promise<{ name: string; bytes: Uint8Array; label: string } | null> {
  const pv = isAdmin ? null : await getPrivateVersion(m.id, u.id);
  const src = chooseServedFile({ material: m, privateVersion: pv, wantOriginal: false });
  const file = await fetchFile(src.fileUrl);
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
  // מצגת: החתימה מתחת לתמונות
  const behind = { behindContent: classifyMaterial(m) === "presentation", mesh };
  const safe = safeEntryName(m.fileName);
  const original = { name: `${stem(safe)} ${tag}${ext(safe)}`, bytes: raw, label: stem(safe) };
  // מנהלת בלבד מקבלת את המקור כשההמרה/ההטבעה נכשלו
  const fallback = (stage: string, e: unknown) => {
    console.error(`folder zip: ${stage} failed`, m.id, e);
    return isAdmin ? original : null;
  };

  if (isOffice && isDriveConfigured()) {
    try {
      const pdf = await convertOfficeToPdfCached({ bytes: raw, mimeType: officeMimeFor(m.mime, m.fileName), name: m.fileName, fileId: driveIdFromUrl(src.fileUrl), defer: after, fillScale });
      return { name: `${stem(safe)} ${tag}.pdf`, bytes: await stampPdf(pdf, stampInfo, behind), label: stem(safe) };
    } catch (e) {
      return fallback("office->pdf", e);
    }
  }
  if (isPdf) {
    try {
      return { name: `${stem(safe)} ${tag}.pdf`, bytes: await stampPdf(raw, stampInfo, behind), label: stem(safe) };
    } catch (e) {
      return fallback("pdf stamp", e);
    }
  }
  if (isImage) {
    try {
      return { name: original.name, bytes: await stampImage(raw, { personalCode: tag }), label: stem(safe) };
    } catch (e) {
      return fallback("image stamp", e);
    }
  }
  return original;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, ctx, "download");
}

/** שליחת כל קבצי התיקייה למייל של המשתמשת (כקובץ זיפ אחד) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, ctx, "email");
}

async function handle(req: NextRequest, ctx: { params: Promise<{ id: string }> }, mode: Mode) {
  const { id } = await ctx.params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const origin = req.nextUrl.origin;
  // ?list=1: רשימת הקבצים שהמשתמשת רשאית להוריד (JSON) – ההורדה "בקבצים נפרדים" בצד הלקוח (זיפ נחסם בנטפרי)
  const listOnly = mode === "download" && req.nextUrl.searchParams.get("list") === "1";
  // בהורדה מפנים (ניווט דפדפן); בשליחה למייל / ברשימה הלקוח הוא fetch, אז מחזירים JSON עם היעד להפניה
  const bounce = (path: string, error: string, status: number) =>
    mode === "email" || listOnly
      ? NextResponse.json({ error, redirect: path }, { status })
      : NextResponse.redirect(new URL(path, origin));
  const user = await getCurrentUser();
  if (!user) {
    const self = `/api/download-folder/${categoryId}`;
    return bounce(`/login?next=${encodeURIComponent(self)}`, "יש להתחבר כדי לשלוח למייל", 401);
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
    return bounce("/login?suspended=1", "החשבון מושהה", 403);
  }

  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!cat) return NextResponse.json({ error: "not found" }, { status: 404 });
  const chain = await getCategoryChain(categoryId);
  const here = chainToHref(chain);

  // שליחה למייל היא פעולה כבדה ויוצאת מחוץ לאתר – מגבילים קצב למשתמשת (לא למנהלת)
  if (mode === "email" && !isAdmin) {
    const rl = await rateLimit({ key: limitKey("folder-mail", user.id), limit: 6, windowSec: 3600 });
    if (!rl.ok) {
      return NextResponse.json({ error: "שלחת הרבה תיקיות למייל בשעה האחרונה, נסי שוב בעוד קצת" }, { status: 429 });
    }
  }

  if (!user.phone && !isAdmin) {
    await deny("no_phone");
    return bounce(
      `/account/phone?next=${encodeURIComponent(`/api/download-folder/${categoryId}`)}`,
      "יש להוסיף מספר טלפון לחשבון לפני הורדת קבצים",
      409,
    );
  }

  // תיקייה משקפת (data.ts CATEGORY_MIRRORS) – גם חומרי תיקיית המקור
  const ids = await expandMirrorIds(await getDescendantIds(categoryId));
  const all = ids.length
    ? await db
        .select()
        .from(materials)
        .where(inArray(materials.categoryId, ids))
        .orderBy(asc(materials.categoryId), asc(materials.id))
    : [];
  // סרטונים לא נכנסים לחבילה (גדולים מדי לזיכרון/לזיפ) – יורדים בנפרד מהכרטיסייה שלהם
  const candidates = all.filter((m) => (m.status === "active" || isAdmin) && (m.allowDownload || isAdmin) && !isVideoMaterial(m));

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
    return bounce(`/checkout?bundle=${categoryId}`, "אין הרשאה לקבצי התיקייה", 402);
  }

  if (listOnly) {
    // בלי שמירת מכסה: כל קובץ יורד בנפרד דרך /api/download/[id], שבודק ומנכה מכסה בעצמו
    return NextResponse.json(
      { ok: true, items: owned.slice(0, FOLDER_MAX_FILES).map((m) => ({ id: m.id, name: m.fileName })), more: Math.max(0, owned.length - FOLDER_MAX_FILES) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ?as=links: במקום זיפ מצורף (נחסם בנטפרי) – מייל עם כפתור הורדה לכל קובץ; כל קובץ יורד בנפרד דרך /api/download/[id] (שם נבדקות ההרשאות והמכסה)
  if (mode === "email" && req.nextUrl.searchParams.get("as") === "links") {
    const listed = owned.slice(0, FOLDER_MAX_FILES);
    const tpl = templates.fileLinks(
      user.name,
      cat.title,
      listed.map((m) => ({ title: m.title, href: `${siteUrl()}/api/download/${m.id}` })),
      Math.max(0, owned.length - FOLDER_MAX_FILES),
    );
    const sent = await sendMail({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html, kind: "material", userId: user.id });
    if (!sent.ok) return NextResponse.json({ error: "שליחת המייל נכשלה, נסי שוב בעוד רגע" }, { status: 502 });
    await logAudit({ actorId: user.id, action: "download.folder.links_email", entityType: "category", entityId: categoryId, details: { folder: cat.title, files: listed.length } });
    return NextResponse.json({ ok: true, email: user.email, files: listed.length, skipped: 0, links: true });
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

      // מכסה ל-30 הימים האחרונים – נגד הורדה המונית של תיקיות שלמות
      const period = await periodRemaining(user);
      if (period !== null && allowed.length > period) {
        limitsHit.push(`המכסה ל-30 הימים האחרונים (נותרו ${period})`);
        allowed = allowed.slice(0, period);
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
        dlToken: dlTokenOf(req.nextUrl),
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
            : r.denied.reason === "period_limit"
              ? "מכסת ההורדות ל-30 הימים האחרונים נוצלה"
              : r.denied.reason === "rate_limit"
                ? "יותר מדי הורדות בזמן קצר – נסי שוב בעוד כמה דקות"
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

  const meshMode = presentationMeshFor(req);
  const fillScale = await getFillLineScale(user.id); // ההגדרה האישית: יחס אורך קווי-המילוי (פעם אחת לכל הזיפ)
  const who: Who = { id: user.id, personalCode: user.personalCode, name: user.name, email: user.email, phone: user.phone };
  type Ready = { name: string; bytes: Uint8Array; label: string; m: Material; via: string };
  const results: (Ready | null)[] = new Array(allowed.length).fill(null);
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, allowed.length) }, async () => {
        while (next < allowed.length) {
          const i = next++;
          try {
            const out = await prepare(allowed[i], who, isAdmin, meshMode, fillScale);
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

  // שליחה למייל: נכשלה/גדול מדי → משחררים את המכסה, כדי שלא תיספר הורדה שלא קרתה
  if (mode === "email") {
    const fail = async (error: string, status: number, reason: string) => {
      await release();
      await deny(reason);
      return NextResponse.json({ error }, { status });
    };
    if (body.byteLength > EMAIL_MAX_ZIP_BYTES) {
      // הזיפ גדול ממגבלת הצרופה של ג'ימייל – מפצלים לכמה מיילים, בכל אחד זיפ מצורף (חלק i מתוך n). הקבצים תמיד מצורפים ממש, לא קישורים.
      // רק קובץ בודד שגדול לבדו מהמגבלה נשלח כקישור הורדה (אין דרך לצרף אותו).
      const esc2 = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const parts: Ready[][] = [];
      const oversize: Ready[] = [];
      let cur: Ready[] = [];
      let curBytes = 0;
      for (const r of ready) {
        if (r.bytes.byteLength > EMAIL_MAX_ZIP_BYTES - 1024 * 1024) {
          oversize.push(r);
          continue;
        }
        if (cur.length && curBytes + r.bytes.byteLength > EMAIL_MAX_ZIP_BYTES - 1024 * 1024) {
          parts.push(cur);
          cur = [];
          curBytes = 0;
        }
        cur.push(r);
        curBytes += r.bytes.byteLength;
      }
      if (cur.length) parts.push(cur);
      const total = parts.length + (oversize.length ? 1 : 0);
      let n = 0;
      for (const group of parts) {
        n++;
        const z = new JSZip();
        const usedNames = new Set<string>();
        for (const r of group) {
          let name = r.name;
          if (usedNames.has(name)) name = `${r.m.id}-${name}`;
          usedNames.add(name);
          z.file(name, r.bytes);
        }
        const partBody = await z.generateAsync({ type: "uint8array", compression: "STORE" });
        const names = group.map((r) => r.label);
        const title = `${cat.title} – כל הקבצים (חלק ${n} מתוך ${total})`;
        const partSent = await sendMail({
          to: user.email,
          subject: title,
          text: [`שלום ${user.name},`, "", `הקבצים גדולים מכדי להישלח במייל אחד, ולכן נשלחו בכמה מיילים. זהו חלק ${n} מתוך ${total}: זיפ עם ${group.length} קבצים מהתיקייה "${cat.title}".`, "כל קובץ מוטבע במספר האישי שלך.", "", ...names].join(String.fromCharCode(10)),
          html: layoutHtml(title, `<p>שלום ${esc2(user.name)},</p><p>הקבצים גדולים מכדי להישלח במייל אחד, ולכן נשלחו בכמה מיילים. זהו <b>חלק ${n} מתוך ${total}</b>: זיפ מצורף עם <b>${group.length}</b> קבצים מהתיקייה <b>${esc2(cat.title)}</b>. כל קובץ מוטבע במספר האישי שלך.</p><ul>${names.map((x) => `<li>${esc2(x)}</li>`).join("")}</ul>`),
          attachment: { fileName: `${safeEntryName(cat.title)} - חלק ${n}.zip`, base64: Buffer.from(partBody).toString("base64"), mimeType: "application/zip" },
          kind: "folder-zip",
          userId: user.id,
        });
        if (!partSent.ok) return fail("שליחת המייל נכשלה, נסי שוב בעוד רגע", 502, "email_send_failed");
      }
      if (oversize.length) {
        const tpl = templates.fileLinks(user.name, cat.title, oversize.map((r) => ({ title: r.m.title, href: `${siteUrl()}/api/download/${r.m.id}` })), 0);
        const linksSent = await sendMail({ to: user.email, subject: `${tpl.subject} (חלק ${total} מתוך ${total})`, text: tpl.text, html: tpl.html, kind: "material", userId: user.id });
        if (!linksSent.ok) return fail("שליחת המייל נכשלה, נסי שוב בעוד רגע", 502, "email_send_failed");
      }
      await logAudit({ actorId: user.id, action: "download.folder.split_email", entityType: "category", entityId: categoryId, details: { folder: cat.title, files: ready.length, parts: total, zipMB: Math.round(body.byteLength / 1048576) } });
      return NextResponse.json({ ok: true, email: user.email, files: ready.length, skipped: 0, parts: total });
    }
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const list = ready.map((r) => r.label); // ברשימה במייל – שם הקובץ בלי המספר האישי (הוא מופיע בשם הקובץ המצורף)
    const sent = await sendMail({
      to: user.email,
      subject: `${cat.title} – כל הקבצים`,
      text: [`שלום ${user.name},`, "", `מצורף קובץ זיפ עם ${ready.length} קבצים מהתיקייה "${cat.title}".`, "כל קובץ מוטבע במספר האישי שלך.", "", ...list].join("\n"),
      html: layoutHtml(
        `${cat.title} – כל הקבצים`,
        `<p>שלום ${esc(user.name)},</p><p>מצורף קובץ זיפ עם <b>${ready.length}</b> קבצים מהתיקייה <b>${esc(cat.title)}</b>. כל קובץ מוטבע במספר האישי שלך.</p><ul>${list.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`,
      ),
      attachment: { fileName: `${safeEntryName(cat.title)}.zip`, base64: Buffer.from(body).toString("base64"), mimeType: "application/zip" },
      kind: "folder-zip",
      userId: user.id,
    });
    if (!sent.ok) {
      console.error("folder email send failed", sent.error);
      return fail("שליחת המייל נכשלה, נסי שוב בעוד רגע (ההורדה לא נספרה)", 502, "email_failed");
    }
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
      details: { folder: cat.title, files: ready.length, here, failedIds, skippedIds, ...(mode === "email" ? { via: "email" } : {}), netfree: netfreeState(req) === "1" ? "yes" : netfreeState(req) === "0" ? "no" : "unknown", zipMB: Math.round(body.byteLength / 1048576) },
    });
  } catch (e) {
    console.error("folder download log failed", e);
  }

  if (mode === "email") {
    return NextResponse.json({ ok: true, files: ready.length, email: user.email, skipped: owned.length - ready.length });
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
