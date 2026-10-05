import "server-only";
import { isDriveUrl, driveIdFromUrl, driveDownload } from "@/lib/driveBridge";

/**
 * מביא את בתי הקובץ מהדרייב (drive://<fileId>) - האחסון היחיד.
 * כל כתובת אחרת מחזירה "לא נמצא": אין יותר Vercel Blob, ואסור שהשרת יביא כתובת
 * http שרירותית שמקורה בשורת DB (SSRF).
 */
export async function fetchFile(
  url: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string | null } | null> {
  if (!isDriveUrl(url)) return null;
  const fileId = driveIdFromUrl(url);
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) return null;
  try {
    const { bytes, mimeType } = await driveDownload(fileId);
    return { stream: new Response(bytes).body as ReadableStream<Uint8Array>, contentType: mimeType };
  } catch (e) {
    console.error("drive download failed", e);
    return null;
  }
}
