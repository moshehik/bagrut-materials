import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/http-utils";
import { signUpload, verifyUpload } from "@/lib/upload-id";
import { driveUrlFor } from "@/lib/driveBridge";
import { MAX_VIDEO_BYTES } from "@/lib/drive-video-copy";
import { isDriveUploadSessionUrl } from "@/lib/video-upload";
import { logAudit } from "@/lib/audit";

// מעביר חתיכה (עד 4MB) לסשן ההעלאה המתחדשת ב-Drive. החתיכה האחרונה מחזירה את מזהה הקובץ + חתימה שמקשרת אותו למורה.
// כל חתיכה חוץ מהאחרונה חייבת להיות כפולה של 256KB (4MB מתאים).
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHUNK = 4 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  let actorId: number | null = null;
  try {
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const user = await requireUser();
    if (user.suspended) throw new Error("FORBIDDEN");
    actorId = user.id;

    const h = request.headers;
    const uploadUrl = h.get("x-upload-url") ?? "";
    const sig = h.get("x-upload-sig");
    const start = Number(h.get("x-range-start"));
    const total = Number(h.get("x-total"));
    if (
      !isDriveUploadSessionUrl(uploadUrl) ||
      !verifyUpload(user.id, uploadUrl, sig) ||
      !Number.isInteger(start) ||
      start < 0 ||
      !Number.isInteger(total) ||
      total <= 0 ||
      total > MAX_VIDEO_BYTES
    ) {
      return NextResponse.json({ error: "פרמטרים לא חוקיים" }, { status: 400 });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) return NextResponse.json({ error: "חתיכה ריקה" }, { status: 400 });
    if (bytes.length > MAX_CHUNK) return NextResponse.json({ error: "חתיכה גדולה מדי" }, { status: 413 });
    const end = start + bytes.length - 1;
    if (end >= total) return NextResponse.json({ error: "טווח לא חוקי" }, { status: 400 });

    const res = await fetch(uploadUrl, {
      method: "PUT",
      redirect: "manual",
      headers: { "Content-Length": String(bytes.length), "Content-Range": `bytes ${start}-${end}/${total}` },
      body: bytes,
      signal: AbortSignal.timeout(55_000),
    });

    if (res.status === 308) return NextResponse.json({ ok: true, done: false, next: end + 1 });
    if (res.status === 200 || res.status === 201) {
      const file = (await res.json().catch(() => ({}))) as { id?: string };
      if (!file.id) throw new Error("דרייב לא החזיר מזהה לקובץ");
      const url = driveUrlFor(file.id);
      await logAudit({ actorId, action: "sicha.video.upload", details: { size: total } });
      return NextResponse.json({ ok: true, done: true, fileId: file.id, fileSig: signUpload(user.id, url), size: total });
    }
    throw new Error(`דרייב דחה את החתיכה (${res.status})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בהעלאה";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    if (actorId) await logAudit({ actorId, action: "sicha.video.upload.failed", details: { stage: "chunk", error: msg.slice(0, 300) } });
    return NextResponse.json({ error: status === 403 ? "אין הרשאה" : msg }, { status });
  }
}
