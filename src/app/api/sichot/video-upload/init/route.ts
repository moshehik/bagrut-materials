import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/http-utils";
import { signUpload } from "@/lib/upload-id";
import { driveFetchAuthed } from "@/lib/driveBridgeCore";
import { ensureCategoryFolder } from "@/lib/driveTree";
import { MAX_VIDEO_BYTES } from "@/lib/drive-video-copy";
import { isVideoFile } from "@/lib/video-upload";
import { logAudit } from "@/lib/audit";

// פותח סשן העלאה מתחדשת ל-Drive בתיקיית הסרטונים; הלקוחה שולחת אחר כך חתיכות של 4MB ל-/chunk דרך הדומיין שלנו
// (נטפרי חוסם דיבור ישיר עם גוגל, ו-Vercel חוסם בקשה גדולה מ-4.5MB), והשרת מעביר אותן הלאה בלי לשמור בזיכרון.
export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { name?: string; mimeType?: string; size?: number; categoryId?: number };

export async function POST(request: Request): Promise<NextResponse> {
  let actorId: number | null = null;
  try {
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const user = await requireUser();
    if (user.suspended) throw new Error("FORBIDDEN");
    actorId = user.id;
    const body = (await request.json().catch(() => ({}))) as Body;
    const name = String(body.name ?? "").trim();
    const mime = String(body.mimeType ?? "");
    const size = Number(body.size) || 0;
    const categoryId = Number(body.categoryId);
    if (!name || !Number.isInteger(categoryId) || categoryId <= 0 || size <= 0) {
      return NextResponse.json({ error: "פרמטרים לא חוקיים" }, { status: 400 });
    }
    if (!isVideoFile(name, mime)) return NextResponse.json({ error: "זה לא נראה כמו קובץ סרטון" }, { status: 400 });
    if (size > MAX_VIDEO_BYTES) return NextResponse.json({ error: "הסרטון גדול במיוחד (מעל 10GB)" }, { status: 413 });

    const [cat] = await db.select({ contentModule: categories.contentModule }).from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (!cat || cat.contentModule !== "sichot_videos") return NextResponse.json({ error: "התיקייה לא נמצאה" }, { status: 404 });

    const parentId = await ensureCategoryFolder(categoryId);
    const driveName = `${name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 150)} – ${Date.now().toString(36)}`;
    const contentType = mime.startsWith("video/") ? mime : "video/mp4";
    const res = await driveFetchAuthed(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,size",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({ name: driveName, parents: [parentId], description: "bagrut-sichot-video" }),
      },
      { tries: 1, timeoutMs: 30_000 },
    );
    const uploadUrl = res.headers.get("location");
    if (!res.ok || !uploadUrl) throw new Error(`פתיחת ההעלאה בדרייב נכשלה (${res.status})`);

    return NextResponse.json({ uploadUrl, sig: signUpload(user.id, uploadUrl), contentType });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בפתיחת ההעלאה";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    if (actorId) await logAudit({ actorId, action: "sicha.video.upload.failed", details: { stage: "init", error: msg.slice(0, 300) } });
    return NextResponse.json({ error: status === 403 ? "אין הרשאה" : msg }, { status });
  }
}
