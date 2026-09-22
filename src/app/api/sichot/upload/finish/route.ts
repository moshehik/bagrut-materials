import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { isSafeId } from "@/lib/blob-server";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/admin-utils";
import { driveChunkFinish, driveUrlFor } from "@/lib/driveBridge";

// מראה מדויקת ל-src/app/api/admin/upload/finish/route.ts, פתוחה לכל מורה מחוברת.
export const runtime = "nodejs";
export const maxDuration = 300;

type Body = { session?: string; name?: string; mimeType?: string; size?: number };

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireUser();
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 });
    }
    const { session, name, mimeType, size } = body;
    if (!isSafeId(session) || !name) {
      return NextResponse.json({ error: "פרמטרים לא חוקיים" }, { status: 400 });
    }
    const total = Number(size) || 0;
    if (total > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "הקובץ גדול מ-200MB" }, { status: 413 });
    }
    const contentType =
      mimeType && ALLOWED_UPLOAD_TYPES.includes(mimeType) ? mimeType : "application/octet-stream";

    const { fileId, size: driveSize } = await driveChunkFinish(session, name, contentType);
    return NextResponse.json({
      url: driveUrlFor(fileId),
      contentType,
      size: driveSize || total,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "איחוד הקובץ נכשל";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
