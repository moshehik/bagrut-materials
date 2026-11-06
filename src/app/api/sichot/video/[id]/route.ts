import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sichaVideos } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { driveFetchAuthed } from "@/lib/driveBridgeCore";
import { contentDisposition } from "@/lib/http-utils";
import { logAudit } from "@/lib/audit";
import { getCategoryChain, chainToHref } from "@/lib/data";
import { sendMail, siteUrl, templates } from "@/lib/mail";
import { SITE_NAME } from "@/lib/constants";
import { TOO_MANY_MESSAGE, limitKey, tooMany } from "@/lib/rate-limit";

// סרטון העשרה – שלוש אפשרויות כמו בכל קובץ, תמיד דרך הדומיין שלנו (נטפרי חוסם את גוגל דרייב):
//   GET            – הורדה למחשב
//   GET ?inline=1  – צפייה באתר (נגן בחלון; תומך ב-Range כדי שאפשר יהיה לדלג בסרטון)
//   POST           – שליחת קישור לדף הסרטון באתר למייל המאומת (הסרטון עצמו גדול מדי לצירוף)
// הסרטון נשמר בדרייב של האתר כ-drive://<fileId> (ר' drive-video-copy.ts). פתוח לכל מורה מחוברת.
// הזרמה ישר מדרייב ללקוחה (בלי לטעון את הסרטון לזיכרון), כדי שגם סרטונים ארוכים יעברו.
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const videoId = Number(id);
  if (!Number.isInteger(videoId) || videoId <= 0) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/api/sichot/video/${videoId}`)}`, req.nextUrl.origin));
  }

  const [video] = await db.select().from(sichaVideos).where(eq(sichaVideos.id, videoId)).limit(1);
  if (!video || (video.status !== "active" && user.role !== "admin") || video.linkKind !== "file") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const range = inline ? req.headers.get("range") : null;

  // מחכים עד 20 שניות לתחילת התשובה בלבד; אחרי שהיא התחילה הגוף מוזרם בלי שעון עצירה
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let upstream: Response | null = null;
  try {
    upstream = await driveFetchAuthed(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(video.driveId)}?alt=media&supportsAllDrives=true`,
      { signal: ctrl.signal, ...(range ? { headers: { Range: range } } : {}) },
      { tries: 2 },
    );
  } catch (e) {
    console.error("sicha video download failed", e);
  } finally {
    clearTimeout(timer);
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    await logAudit({ actorId: user.id, action: "sicha.video.download.failed", entityType: "sicha_video", entityId: videoId, details: {} });
    return NextResponse.json({ error: "הסרטון אינו זמין כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }

  const upstreamType = upstream.headers.get("content-type");
  const type = upstreamType?.startsWith("video/") ? upstreamType : "video/mp4";
  const fileName = `${video.title.replace(/[\/:*?"<>|]+/g, " ").trim() || "video"}${EXT_BY_TYPE[type] ?? ".mp4"}`;

  // צפייה: רושמים פעם אחת בתחילת הניגון, לא על כל בקשת Range של הנגן
  if (!inline || !range || range.startsWith("bytes=0-")) {
    await logAudit({
      actorId: user.id,
      action: inline ? "sicha.video.view" : "sicha.video.download",
      entityType: "sicha_video",
      entityId: videoId,
      details: { fileName },
    });
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

// "שליחת קישור למייל": מייל עם קישור לדף הסרטון באתר, לכתובת המאומתת של המורה
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const videoId = Number((await ctx.params).id);
  if (!Number.isInteger(videoId) || videoId <= 0) return json({ ok: false, error: "bad id" }, 400);
  const [video] = await db.select().from(sichaVideos).where(eq(sichaVideos.id, videoId)).limit(1);
  if (!video || (video.status !== "active" && user.role !== "admin")) return json({ ok: false, error: "הסרטון לא נמצא" }, 404);

  const link = `${siteUrl()}${chainToHref(await getCategoryChain(video.categoryId))}?video=${video.id}`;
  const tpl = templates.manual(
    `${video.title} – ${SITE_NAME}`,
    `שלום ${user.name},\n\nכמבוקש, הקישור לסרטון "${video.title}":\n${link}\n\nהסרטון נפתח באתר לצפייה, ואפשר גם להוריד אותו משם.\n\nבהצלחה בשיעור!`,
  );
  const r = await sendMail({
    to: user.email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    kind: "material",
    userId: user.id,
  });
  if (!r.ok) return json({ ok: false, error: "שליחת המייל נכשלה, נסי שוב בעוד רגע" }, 502);
  await logAudit({ actorId: user.id, action: "sicha.video.email_link", entityType: "sicha_video", entityId: videoId, details: {} });
  return json({ ok: true, email: user.email });
}
