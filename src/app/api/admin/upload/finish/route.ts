import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { isSafeId } from "@/lib/upload-id";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/admin-utils";
import { driveChunkFinish, driveUrlFor } from "@/lib/driveBridge";
import { logAudit } from "@/lib/audit";

// מאחד את החתיכות (שנצברו ב-/chunk דרך archive_append) לקובץ אחד בדרייב.
// כל ההעלאות עוברות דרך הדרייב (Vercel Blob בוטל לחלוטין).
export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  session?: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

export async function POST(request: Request): Promise<NextResponse> {
  // נשמר מחוץ ל-try כדי שגם בכשל נדע מי ניסתה להעלות
  let me: Awaited<ReturnType<typeof requireAdmin>> | null = null;
  let uploadName: string | undefined;
  try {
    me = await requireAdmin();
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
    uploadName = name;
    const total = Number(size) || 0;
    if (total > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "הקובץ גדול מ-200MB" }, { status: 413 });
    }
    const contentType =
      mimeType && ALLOWED_UPLOAD_TYPES.includes(mimeType) ? mimeType : "application/octet-stream";

    const { fileId, size: driveSize } = await driveChunkFinish(session, name, contentType);
    await logAudit({
      actorId: me.id,
      action: "upload.finish",
      entityType: "upload",
      details: { name, size: driveSize || total, contentType, fileId },
    });
    return NextResponse.json({
      url: driveUrlFor(fileId),
      contentType,
      size: driveSize || total,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "איחוד הקובץ נכשל";
    // נרשמות רק כשלים של מנהלת מחוברת (לא ניסיונות לא מורשים)
    if (me) {
      await logAudit({
        actorId: me.id,
        action: "upload.fail",
        entityType: "upload",
        details: { name: uploadName ?? null, error: msg },
      });
    }
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
