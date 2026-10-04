import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { isSafeId } from "@/lib/upload-id";
import { driveChunkAppend } from "@/lib/driveBridge";

// חתיכות (עד 4MB) של קובץ שמועלה מהדפדפן. ה-PUT הישיר ל-vercel.com נחסם ע"י
// מסנני אינטרנט מקומיים (נטפרי וכד') שמאפשרים לדפדפן לדבר רק עם הדומיין שלנו,
// ומגבלת גוף-הבקשה של פונקציות Vercel היא 4.5MB. /finish מאחד את החתיכות בשרת.
// חתיכות מאוחסנות זמנית בדרייב עצמו (Vercel Blob בוטל לחלוטין)
// (archive_append, ר' driveBridgeCore.ts).
export const runtime = "nodejs";

const MAX_CHUNK = 4 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const session = url.searchParams.get("session");
    const index = parseInt(url.searchParams.get("index") ?? "", 10);
    if (!isSafeId(session) || !Number.isInteger(index) || index < 0 || index > 999) {
      return NextResponse.json({ error: "פרמטרים לא חוקיים" }, { status: 400 });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) return NextResponse.json({ error: "חתיכה ריקה" }, { status: 400 });
    if (bytes.length > MAX_CHUNK) return NextResponse.json({ error: "חתיכה גדולה מדי" }, { status: 413 });

    await driveChunkAppend(session, index, bytes);
    return NextResponse.json({ ok: true, index, size: bytes.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בהעלאה";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
