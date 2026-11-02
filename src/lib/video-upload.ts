import "server-only";

/** סוגי סרטון שמותר להעלות (לפי mime, ואם הדפדפן לא ידע – לפי סיומת) */
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|mpg|mpeg|3gp)$/i;
export function isVideoFile(name: string, mime: string): boolean {
  return mime.startsWith("video/") || VIDEO_EXT.test(name);
}

/** כתובת סשן העלאה מתחדשת (resumable) של Drive – רק כתובת כזו נקבלת מהלקוחה, כדי שלא נשלח בייטים לכתובת שרירותית */
export function isDriveUploadSessionUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname === "www.googleapis.com" && url.pathname.startsWith("/upload/drive/v3/files");
  } catch {
    return false;
  }
}
