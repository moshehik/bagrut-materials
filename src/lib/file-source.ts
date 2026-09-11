import "server-only";
import { isDriveUrl, driveIdFromUrl, driveDownload } from "@/lib/driveBridge";

/** מביא את בתי הקובץ מהמקום שבו הוא מאוחסן בפועל (דרייב / Vercel Blob פרטי / URL רגיל) */
export async function fetchFile(
  url: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string | null } | null> {
  // קבצי טיוטה/ארכיון מאוחסנים בדרייב (drive://<fileId>) דרך גשר ה-Apps Script
  if (isDriveUrl(url)) {
    const fileId = driveIdFromUrl(url);
    if (!fileId) return null;
    try {
      const { bytes, mimeType } = await driveDownload(fileId);
      return { stream: new Response(bytes).body as ReadableStream<Uint8Array>, contentType: mimeType };
    } catch (e) {
      console.error("drive download failed", e);
      return null;
    }
  }
  // קבצים ב-Vercel Blob פרטי; אם אין טוקן / נכשל – נופלים ל-fetch רגיל
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { get } = await import("@vercel/blob");
      const res = await get(url, { access: "private" });
      if (res && res.stream) {
        return { stream: res.stream, contentType: res.blob.contentType ?? null };
      }
    } catch {
      /* fallback below */
    }
  }
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok || !r.body) return null;
    return { stream: r.body, contentType: r.headers.get("content-type") };
  } catch {
    return null;
  }
}
