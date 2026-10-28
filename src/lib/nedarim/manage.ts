import "server-only";
import { getNedarimApiPassword, redactNedarim } from "./secrets";

/**
 * Manage3 – ה-API של נדרים פלוס לניהול המוסד (מפתח npk_ מ-reports.matara.pro > הגדרות > API). כאן רק GetHistoryJson:
 * היסטוריית העסקאות של המוסד (כל האשראי), עולה לפי TransactionId, LastId = "אחרי מספר זה" (exclusive), MaxId = מספר שורות
 * מרבי (עד 2000), מוגבל ל-20 קריאות בשעה למוסד – ולכן כל הקריאות עוברות דרך השער ב-sync.ts (לעולם לא ישירות).
 * שדות התשובה לפי תיעוד ה-API: TransactionId, Amount, Currency (1=ש"ח), Phone, Mail, Comments, TransactionTime, ClientName,
 * Confirmation, LastNum … (parseHistoryRow ב-logic.ts). עסקאות מבוטלות = Amount 0; זיכויים = שורות נפרדות בסכום שלילי.
 * המפתח נשלח ב-POST body בלבד (לא ב-URL), וכל שגיאה עוברת redactNedarim – המפתח לא מגיע ללוגים/DB.
 */
const MANAGE3_URL = "https://matara.pro/nedarimplus/Reports/Manage3.aspx";
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARS = 4_000_000;

export async function getTransactionHistory(params: {
  mosadId: string;
  lastId?: number;
  maxId?: number;
}): Promise<{ raw: string; json: unknown }> {
  const extra: Record<string, string> = {};
  if (params.lastId !== undefined && params.lastId !== null) extra.LastId = String(params.lastId);
  if (params.maxId !== undefined) extra.MaxId = String(params.maxId);
  return manageCall("GetHistoryJson", params.mosadId, extra);
}

/**
 * פירוט הוראת קבע בודדת (`GetKevaId`, קריאה בלבד): סטטוס, סכום חודשי, חיובים שבוצעו ויתרה, תדירות – לאימות ההוראה מול התנאים
 * שנקבעו לפני שפותחים מנוי על חיוב ראשון (logic.ts checkKevaRecord). בתיעוד אין לה מגבלת 20 בשעה, ובכל זאת נקראת רק כשחיוב
 * של הוראת קבע הותאם לבקשה (נדיר), ושגיאה/היעדר תשובה אף פעם לא פותחים מנוי.
 */
export async function getKevaDetails(params: { mosadId: string; kevaId: string }): Promise<unknown> {
  if (!/^\d{1,20}$/.test(params.kevaId)) throw new Error("מזהה הוראת קבע לא תקין");
  const { json } = await manageCall("GetKevaId", params.mosadId, { KevaId: params.kevaId });
  return json;
}

async function manageCall(action: string, mosadId: string, extra: Record<string, string>): Promise<{ raw: string; json: unknown }> {
  const pw = await getNedarimApiPassword();
  if (!pw) throw new Error("מפתח ה-API של נדרים אינו מוגדר");
  const body = new URLSearchParams({ Action: action, ApiPassword: pw, MosadId: mosadId, ...extra });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(MANAGE3_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error", // לא עוקבים אחרי הפניות – המפתח לא יישלח לדומיין אחר
    });
    const raw = (await res.text()).slice(0, MAX_RESPONSE_CHARS);
    if (!res.ok) throw new Error(`Manage3 HTTP ${res.status}`);
    let json: unknown = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* חלק מהפעולות מחזירות טקסט */
    }
    return { raw, json };
  } catch (e) {
    // הודעת השגיאה של fetch יכולה להכיל URL/גוף – מסתירים לפני שהיא עולה הלאה
    throw new Error(redactNedarim(e instanceof Error ? e.message : String(e)).slice(0, 200));
  } finally {
    clearTimeout(timer);
  }
}
