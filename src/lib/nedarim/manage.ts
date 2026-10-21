import "server-only";

/**
 * Manage3 – ה-API של נדרים פלוס לניהול המוסד (מפתח npk_ מ-reports.matara.pro > הגדרות > API). כאן רק GetHistoryJson:
 * היסטוריית העסקאות של המוסד (כל האשראי), עולה לפי TransactionId, עד 2000 שורות לקריאה, ומוגבל ל-20 קריאות בשעה למוסד.
 * שמות הפעולה והפרמטרים (Action, ApiPassword, MosadId, LastId, MaxId) – כמו במימוש של gemach-app (app/lib/nedarimManage.js),
 * שנבנה מהמסמך של נדרים; המשמעות המדויקת של LastId/MaxId לא אומתה מול תשובה אמיתית.
 */
const MANAGE3_URL = "https://matara.pro/nedarimplus/Reports/Manage3.aspx";
const TIMEOUT_MS = 15_000;

export async function getTransactionHistory(params: {
  mosadId: string;
  lastId?: number;
  maxId?: number;
}): Promise<{ raw: string; json: unknown }> {
  const pw = (process.env.NEDARIM_API_PASSWORD ?? "").trim();
  if (!pw) throw new Error("NEDARIM_API_PASSWORD אינו מוגדר");
  const body = new URLSearchParams({ Action: "GetHistoryJson", ApiPassword: pw, MosadId: params.mosadId });
  if (params.lastId !== undefined) body.set("LastId", String(params.lastId));
  if (params.maxId !== undefined) body.set("MaxId", String(params.maxId));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // POST (ולא GET) כדי שהמפתח לא יופיע ב-URL / בלוגים
    const res = await fetch(MANAGE3_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* חלק מהפעולות מחזירות טקסט */
    }
    if (!res.ok) throw new Error(`Manage3 HTTP ${res.status}: ${raw.slice(0, 200)}`);
    return { raw, json };
  } finally {
    clearTimeout(timer);
  }
}
