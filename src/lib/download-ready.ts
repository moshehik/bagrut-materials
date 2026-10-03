/**
 * סימון "הקובץ מוכן" לאגוז הטעינה (DownloadLoader).
 * הורדה עם Content-Disposition: attachment לא מנווטת מהדף, כך שאין לדפדפן אירוע
 * "ההורדה התחילה". לכן הלקוח מוסיף ?dlt=<token> לקישור, והשרת מחזיר יחד עם הקובץ
 * עוגייה קצרה dl_<token> – הלקוח מזהה אותה ומסתיר את האגוז.
 */
export function markDownloadReady(url: URL, res: Response): Response {
  const token = url.searchParams.get("dlt");
  if (token && /^[a-z0-9]{6,32}$/.test(token)) {
    res.headers.append("Set-Cookie", `dl_${token}=1; Path=/; Max-Age=120; SameSite=Lax`);
  }
  return res;
}
