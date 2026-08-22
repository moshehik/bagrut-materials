import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { put, del, get, CHUNK_PREFIX, isSafeId } from "@/lib/blob-server";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/admin-utils";

// מאחד את החתיכות (מ-/chunk) לקובץ פרטי אחד ב-Blob, ומוחק את הזמניים.
export const runtime = "nodejs";
export const maxDuration = 300;

const STORE_HOST_RE = /^https:\/\/[a-z0-9-]+\.private\.blob\.vercel-storage\.com\//i;

type Body = {
  session?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  urls?: string[];
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireAdmin();
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 });
    }
    const { session, name, mimeType, size, urls } = body;
    if (!isSafeId(session) || !name || !Array.isArray(urls) || !urls.length || urls.length > 1000) {
      return NextResponse.json({ error: "פרמטרים לא חוקיים" }, { status: 400 });
    }
    const total = Number(size) || 0;
    if (total > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "הקובץ גדול מ-200MB" }, { status: 413 });
    }
    const contentType =
      mimeType && ALLOWED_UPLOAD_TYPES.includes(mimeType) ? mimeType : "application/octet-stream";

    // רק חתיכות של המשתמש הזה, מהסשן הזה, מהחנות שלנו
    const prefix = `${CHUNK_PREFIX}${user.id}/${session}/`;
    for (const u of urls) {
      const s = String(u || "");
      if (!STORE_HOST_RE.test(s) || !s.replace(STORE_HOST_RE, "").startsWith(prefix)) {
        return NextResponse.json({ error: "חתיכה לא שייכת להעלאה הזו" }, { status: 400 });
      }
    }

    const cleanName = String(name).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180);
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (i < urls.length) {
          const chunk = await get(urls[i++], { access: "private" });
          if (!chunk) throw new Error(`חתיכה ${i} לא נמצאה`);
          const buf = new Uint8Array(await new Response(chunk.stream).arrayBuffer());
          if (buf.byteLength) {
            controller.enqueue(buf);
            return;
          }
        }
        controller.close();
      },
    });

    const blob = await put(cleanName, stream, {
      access: "private",
      addRandomSuffix: true,
      contentType,
      multipart: true,
    });
    await del(urls).catch(() => {});
    return NextResponse.json({
      url: blob.url,
      contentType: blob.contentType,
      size: total,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "איחוד הקובץ נכשל";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
