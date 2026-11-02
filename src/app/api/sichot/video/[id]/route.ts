import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sichaVideos } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { driveFetchAuthed } from "@/lib/driveBridgeCore";
import { contentDisposition } from "@/lib/http-utils";
import { logAudit } from "@/lib/audit";

// הורדת סרטון העשרה למחשב – דרך הדומיין שלנו (נטפרי חוסם את גוגל דרייב), בלי צפייה באתר ובלי שליחה במייל.
// הסרטון נשמר בדרייב של האתר כ-drive://<fileId> (ר' drive-video-copy.ts). פתוח לכל מורה מחוברת.
// ההורדה מוזרמת ישר מדרייב ללקוחה (בלי לטעון את הסרטון לזיכרון), כדי שגם סרטונים ארוכים יעברו.
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

  // מחכים עד 20 שניות לתחילת התשובה בלבד; אחרי שהיא התחילה הגוף מוזרם בלי שעון עצירה
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let upstream: Response | null = null;
  try {
    upstream = await driveFetchAuthed(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(video.driveId)}?alt=media&supportsAllDrives=true`,
      { signal: ctrl.signal },
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

  await logAudit({ actorId: user.id, action: "sicha.video.download", entityType: "sicha_video", entityId: videoId, details: { fileName } });

  const length = upstream.headers.get("content-length");
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      ...(length ? { "Content-Length": length } : {}),
      "Content-Disposition": contentDisposition(fileName),
      "Cache-Control": "private, no-store",
    },
  });
}
