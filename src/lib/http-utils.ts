/**
 * כותרת Content-Disposition לקובץ מורד, בטוחה לשמות בעברית:
 * `filename` ב-ASCII (תווים לא-ASCII הופכים ל-`_`, גרשיים לגרש) לדפדפנים ישנים,
 * ו-`filename*` ב-UTF-8 מקודד (RFC 5987) לשם המלא.
 */
export function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * שגיאה למשתמשת מ-route של קובץ (הורדה/תצוגה): כשהדפדפן ניווט ישירות לקישור (Accept: text/html) מחזירים דף
 * עברי קטן במקום JSON גולמי על המסך; ל-fetch/JS (Accept: application/json או כל דבר אחר) – JSON כמו קודם.
 */
export function fileRouteError(req: Request, message: string, status: number): Response {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html") && !accept.includes("application/json")) {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>לא ניתן להוריד את הקובץ</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#f6f8fb;color:#1f2937;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fff;border-radius:16px;padding:32px 28px;max-width:420px;box-shadow:0 6px 24px rgba(0,0,0,.08);text-align:center}h1{font-size:1.25rem;margin:0 0 12px}p{margin:0 0 20px;line-height:1.6}a{display:inline-block;padding:10px 18px;border-radius:999px;background:#3f6aa0;color:#fff;text-decoration:none}</style></head>
<body><main><h1>לא ניתן להוריד את הקובץ</h1><p>${esc(message)}</p><a href="javascript:history.back()">חזרה לדף הקודם</a></main></body></html>`;
    return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
