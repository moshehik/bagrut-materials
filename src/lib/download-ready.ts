/**
 * סימון "הקובץ מוכן" לאגוז הטעינה (DownloadLoader).
 * הורדה עם Content-Disposition: attachment לא מנווטת מהדף, כך שאין לדפדפן אירוע
 * "ההורדה התחילה". לכן הלקוח מוסיף ?dlt=<token> לקישור, והשרת מחזיר יחד עם הקובץ
 * עוגייה קצרה dl_<token> – הלקוח מזהה אותה ומסתיר את האגוז.
 */

/** צורת טוקן תקינה (אותו כלל בעוגייה, ברישום ב-downloads ובנתיב /api/download-failed) */
export const DL_TOKEN_RE = /^[a-z0-9]{6,32}$/;

/** הטוקן ?dlt= מהכתובת, או null אם חסר/לא תקין */
export function dlTokenOf(url: URL): string | null {
  const token = url.searchParams.get("dlt");
  return token && DL_TOKEN_RE.test(token) ? token : null;
}

export function markDownloadReady(url: URL, res: Response): Response {
  const token = dlTokenOf(url);
  if (token) {
    res.headers.append("Set-Cookie", `dl_${token}=1; Path=/; Max-Age=120; SameSite=Lax`);
  }
  return res;
}
