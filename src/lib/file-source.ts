import "server-only";
import { isDriveUrl, driveIdFromUrl, driveDownload } from "@/lib/driveBridge";

/** מביא את בתי הקובץ מהדרייב (drive://<fileId>). אין יותר Vercel Blob - בוטל לחלוטין. */
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
  // שורות ישנות שהצביעו ל-Vercel Blob: החנות בוטלה, אין מה להביא - מחזירים "לא נמצא"
  // (מעלים את הקובץ מחדש דרך טופס ההעלאה, שהולך לדרייב).
  if (url.includes(".vercel-storage.com")) return null;
  // כתובת http(s) רגילה (למשל תוכן חיצוני) - fetch רגיל
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok || !r.body) return null;
    return { stream: r.body, contentType: r.headers.get("content-type") };
  } catch {
    return null;
  }
}
