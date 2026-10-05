/**
 * כותרת Content-Disposition לקובץ מורד, בטוחה לשמות בעברית:
 * `filename` ב-ASCII (תווים לא-ASCII הופכים ל-`_`, גרשיים לגרש) לדפדפנים ישנים,
 * ו-`filename*` ב-UTF-8 מקודד (RFC 5987) לשם המלא.
 */
export function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
