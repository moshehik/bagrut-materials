import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads, materials } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement, getCategoryChain, chainToHref } from "@/lib/data";
import { driveFetchAuthed } from "@/lib/driveBridgeCore";
import { driveIdFromUrl } from "@/lib/driveBridge";
import { shareVideoWithUser } from "@/lib/drive-share";
import { contentDisposition, fileRouteError } from "@/lib/http-utils";
import { logAudit, requestMeta } from "@/lib/audit";
import { reserveDownloads, type Reservation, type ReserveResult } from "@/lib/download-quota";
import { sendMail, siteUrl, templates } from "@/lib/mail";
import { SITE_NAME } from "@/lib/constants";
import { TOO_MANY_MESSAGE, limitKey, tooMany } from "@/lib/rate-limit";

// סרטון מלווה בתוך תיקיית פרק (חומר רגיל מסוג וידאו) – שלוש אפשרויות כמו בכל קובץ, תמיד דרך הדומיין שלנו (נטפרי חוסם את גוגל דרייב):
//   GET            – הורדה למחשב (נספרת במכסת ההורדות כמו כל קובץ)
//   GET ?inline=1  – צפייה באתר (נגן בחלון; תומך ב-Range כדי שאפשר יהיה לדלג בסרטון)
//   POST           – שליחת קישור לסרטון באתר למייל המאומת (הסרטון עצמו גדול מדי לצירוף)
// הסרטון מוזרם ישר מדרייב ללקוחה בלי לטעון אותו לזיכרון. אין הטבעת סימן מים בתוך הקובץ (לא ניתן בלי עיבוד וידאו).
// הרשאות: אותן הרשאות של שאר החומרים בפרק (חינם / רכישה / מנוי) – checkEntitlement.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
  "video/webm": ".webm",
  "video/x-msvideo": ".avi",
};

type Ctx = { params: Promise<{ id: string }> };

async function loadMaterial(ctx: Ctx) {
  const materialId = Number((await ctx.params).id);
  if (!Number.isInteger(materialId) || materialId <= 0) return null;
  const [material] = await db.select().from(materials).where(eq(materials.id, materialId)).limit(1);
  return material ?? null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const material = await loadMaterial(ctx);
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await getCurrentUser();
  const origin = req.nextUrl.origin;
  const isAdmin = user?.role === "admin";
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const self = `/api/material-video/${material.id}${inline ? "?inline=1" : ""}`;

  const deny = (reason: string) =>
    !user
      ? Promise.resolve()
      : logAudit({
          actorId: user.id,
          action: "download.denied",
          entityType: "material",
          entityId: material.id,
          details: { reason, video: true },
        });

  if (user?.suspended) {
    await deny("user_suspended");
    return NextResponse.redirect(new URL("/login?suspended=1", origin));
  }
  if (material.status !== "active" && !isAdmin) {
    await deny("material_inactive");
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // "צפייה בלבד" = אי אפשר להוריד, אבל אפשר לראות
  if (!inline && material.allowDownload === false && !isAdmin) {
    await deny("view_only");
    return fileRouteError(req, "צפייה בלבד", 403);
  }

  const ent = await checkEntitlement(user, material);
  if (!ent.ok) {
    await deny(ent.reason);
    switch (ent.reason) {
      case "login":
        return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(self)}`, origin));
      case "purchase":
        return NextResponse.redirect(new URL(`/checkout?material=${material.id}`, origin));
      default:
        return NextResponse.redirect(new URL(`/pricing?reason=${ent.reason}`, origin));
    }
  }
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(self)}`, origin));

  const driveId = driveIdFromUrl(material.fileUrl);
  if (!material.fileUrl.startsWith("drive://") || !driveId || !/^[A-Za-z0-9_-]+$/.test(driveId)) {
    return fileRouteError(req, "הסרטון אינו זמין כרגע, נסי שוב מאוחר יותר", 502);
  }

  // הורדה: הזמנת מכסה (כמו כל קובץ), משוחררת אם ההזרמה לא התחילה. צפייה באתר לא נספרת (הנגן שולח בקשות Range רבות)
  let reservation: Reservation | null = null;
  if (!inline && !isAdmin) {
    let r: ReserveResult;
    try {
      r = await reserveDownloads({ user, items: [{ material, ent }], kind: "download", meta: await requestMeta() });
    } catch (e) {
      console.error("video download limit check failed", e);
      await deny("limit_check_failed");
      return fileRouteError(req, "לא ניתן לבדוק את מכסת ההורדות כרגע, נסי שוב בעוד רגע", 503);
    }
    if (!r.ok) {
      await deny(r.denied.reason);
      switch (r.denied.reason) {
        case "material_limit":
          return NextResponse.redirect(new URL("/account?limit=1&material=" + material.id, origin));
        case "quota":
          return NextResponse.redirect(new URL("/pricing?reason=quota", origin));
        case "period_limit":
          return NextResponse.redirect(new URL("/account?limit=period", origin));
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
      console.error("video download quota release failed", e);
    }
  };

  const range = inline ? req.headers.get("range") : null;
  // מחכים עד 20 שניות לתחילת התשובה בלבד; אחרי שהיא התחילה הגוף מוזרם בלי שעון עצירה
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let upstream: Response | null = null;
  try {
    upstream = await driveFetchAuthed(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true`,
      { signal: ctrl.signal, ...(range ? { headers: { Range: range } } : {}) },
      { tries: 2 },
    );
  } catch (e) {
    console.error("material video fetch failed", e);
  } finally {
    clearTimeout(timer);
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    await release();
    await logAudit({
      actorId: user.id,
      action: "download.file_missing",
      entityType: "material",
      entityId: material.id,
      details: { driveId, video: true },
    });
    return fileRouteError(req, "הסרטון אינו זמין כרגע, נסי שוב מאוחר יותר", 502);
  }

  const upstreamType = upstream.headers.get("content-type");
  const type = upstreamType?.startsWith("video/") ? upstreamType : material.mime.startsWith("video/") ? material.mime : "video/mp4";
  const baseName = material.fileName.replace(/\.[^.]+$/, "") || material.title;
  const fileName = `${baseName.replace(/[\/:*?"<>|]+/g, " ").trim() || "video"}${EXT_BY_TYPE[type] ?? ".mp4"}`;

  // תיעוד: צפייה – פעם אחת בתחילת הניגון (לא על כל בקשת Range); הורדה – תמיד
  try {
    if (!inline || !range || range.startsWith("bytes=0-")) {
      if (!inline) {
        if (isAdmin) {
          const { ip, userAgent } = await requestMeta();
          await db.insert(downloads).values({ userId: user.id, materialId: material.id, watermark: user.personalCode, ip, userAgent, via: ent.via });
        }
        await db.update(materials).set({ downloads: sql`${materials.downloads} + 1` }).where(eq(materials.id, material.id));
      } else {
        await db.update(materials).set({ views: sql`${materials.views} + 1` }).where(eq(materials.id, material.id));
      }
      await logAudit({
        actorId: user.id,
        action: inline ? "preview" : "download",
        entityType: "material",
        entityId: material.id,
        details: { via: ent.via, title: material.title, video: true },
      });
    }
  } catch (e) {
    console.error("material video log failed", e);
  }

  const length = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers: {
      "Content-Type": type,
      ...(length ? { "Content-Length": length } : {}),
      ...(contentRange ? { "Content-Range": contentRange } : {}),
      ...(inline ? { "Accept-Ranges": "bytes" } : {}),
      "Content-Disposition": inline ? "inline" : contentDisposition(fileName),
      "Cache-Control": "private, no-store",
    },
  });
}

// "שליחה למייל": מייל עם קישור לסרטון בתיקיית הפרק באתר, לכתובת המאומתת של המורה (הסרטון עצמו גדול מדי לצירוף)
export async function POST(req: NextRequest, ctx: Ctx) {
  const json = (body: Record<string, unknown>, status = 200) =>
    NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

  // הגנת CSRF: רק בקשה מאותו דומיין (הפעולה שולחת מייל)
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ ok: false, error: "forbidden" }, 403);

  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "צריך להתחבר", redirect: "/login" }, 401);
  if (user.role !== "admin" && !user.emailVerified) {
    return json(
      { ok: false, error: "כדי לקבל קישורים במייל צריך קודם לאמת את כתובת המייל באזור האישי", redirect: "/account" },
      403,
    );
  }
  if (await tooMany(limitKey("email-material", user.id), 15, 600)) return json({ ok: false, error: TOO_MANY_MESSAGE }, 429);

  const material = await loadMaterial(ctx);
  if (!material || (material.status !== "active" && user.role !== "admin")) return json({ ok: false, error: "הסרטון לא נמצא" }, 404);

  const ent = await checkEntitlement(user, material);
  if (!ent.ok) {
    const redirect = ent.reason === "purchase" ? `/checkout?material=${material.id}` : ent.reason === "quota" ? "/pricing" : null;
    return json({ ok: false, error: "לא ניתן לשלוח את הקישור לפני השלמת הצעד הבא", ...(redirect ? { redirect } : {}) }, 409);
  }

  // קישור ישיר לקובץ בדרייב, עם הרשאת צפייה אישית לכתובת המייל של המשתמשת (נפתח רק בחשבון גוגל עם אותה כתובת).
  // אם השיתוף נכשל (למשל כתובת שאינה חשבון גוגל) – חוזרים לקישור לאתר, כמו קודם.
  // לדרייב יש תקרה למספר המשתמשות לכל קובץ, ולכן השיתוף נעשה ברסיסים (עותקי שרת) – ר' src/lib/drive-share-core.ts.
  const fileId = driveIdFromUrl(material.fileUrl);
  const shared = fileId
    ? await shareVideoWithUser({ materialId: material.id, originalFileId: fileId, userId: user.id, email: user.email, title: material.title })
    : null;
  const siteLink = `${siteUrl()}${chainToHref(await getCategoryChain(material.categoryId))}#material-${material.id}`;
  // כפתורים עם קישור מוטמע (לא כתובת גלויה): כפתור ראשי לאתר, ומשני לדרייב כשהשיתוף הצליח
  const tpl = templates.videoLinks(user.name, material.title, [
    { label: "לצפייה בסרטון באתר", href: siteLink },
    ...(shared ? [{ label: "פתיחה בדרייב", href: shared.link, note: `הסרטון שותף איתך אישית (${user.email}) – צריך להיות מחוברת לגוגל באותה כתובת מייל` }] : []),
  ]);
  const r = await sendMail({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html, kind: "material", userId: user.id });
  if (!r.ok) return json({ ok: false, error: "שליחת המייל נכשלה, נסי שוב בעוד רגע" }, 502);
  await logAudit({ actorId: user.id, action: "material.video.email_link", entityType: "material", entityId: material.id, details: { driveShared: !!shared, ...(shared ? { sharedWith: user.email, shard: shared.shard, shareReused: shared.reused, newShard: shared.newShard } : {}) } });
  return json({ ok: true, email: user.email });
}
