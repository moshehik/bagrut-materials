/**
 * עוזר ה-AI למנהלת (/admin/assistant) – החלק הטהור: בלי DB, רשת או next, כדי שאפשר לבדוק אותו (scripts/admin-assistant.test.ts).
 *
 * עקרונות (נלקחו מעוזר ה-AI של gemach-app ומותאמים; ר' docs/admin-assistant.md):
 *  - היסטוריה מהלקוח היא נתון לא מהימן: חותכים אורך/מספר, מאמתים תפקידים, מסירים תווי בקרה.
 *  - המודל לא כותב SQL: הוא רק בוחר כלים קבועים עם פרמטרים, והפרמטרים עוברים אימות/חיתוך כאן.
 *  - תוצאות כלים הן נתונים בלבד (מוצגות בתוך בלוק <נתונים>), לעולם לא הוראות.
 */

export const MAX_QUESTION_CHARS = 1200;
export const MAX_HISTORY_TURNS = 10;
export const MAX_HISTORY_CHARS = 1500;
export const MAX_TOOL_CALLS = 3;
/** תקרת גודל תוצאות הכלים שנשלחות למודל (תווים של JSON) */
export const MAX_TOOL_RESULT_CHARS = 12_000;

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** מנקה טקסט מהלקוח: תווי בקרה (חוץ משורה חדשה / טאב), רווחים מיותרים, חיתוך אורך */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‎‏‪-‮⁦-⁩]/g, "").replace(/\r\n?/g, "\n").trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** היסטוריה תקינה: רק user/assistant, תוכן לא ריק, עד MAX_HISTORY_TURNS אחרונות, מתחילה ב-user */
export function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    if (role !== "user" && role !== "assistant") continue;
    const content = cleanText((m as { content?: unknown }).content, MAX_HISTORY_CHARS);
    if (content) out.push({ role, content });
  }
  const tail = out.slice(-MAX_HISTORY_TURNS);
  while (tail.length && tail[0].role !== "user") tail.shift();
  return tail;
}

// ---------------------------------------------------------------------------------------------------------------------
// אימות פרמטרים של כלים

export function intArg(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function strArg(v: unknown, max: number): string {
  return typeof v === "string" ? cleanText(v, max).replace(/\s+/g, " ") : "";
}

export function enumArg<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}

/** תאריך YYYY-MM-DD תקין (ובטווח סביר) או null */
export function dateArg(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  const y = d.getUTCFullYear();
  return y >= 2020 && y <= 2100 ? v : null;
}

/** מילות חיפוש ל-ILIKE: בלי תווי LIKE מיוחדים (% _ \) */
export function likePattern(q: string): string {
  return "%" + q.replace(/[\\%_]/g, " ").replace(/\s+/g, " ").trim() + "%";
}

// ---------------------------------------------------------------------------------------------------------------------
// תוכנית הכלים שהמודל מחזיר

export type PlannedCall = { tool: string; args: Record<string, unknown> };
export type Plan = { calls: PlannedCall[]; reply: string | null };

/** מפענח את תשובת ה"מתכנן". סובל גדר ```json ותוספות סביב ה-JSON. מחזיר null אם אין JSON קריא */
export function parsePlan(text: string, knownTools: ReadonlySet<string>): Plan | null {
  let t = String(text ?? "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as { calls?: unknown; reply?: unknown };
  const calls: PlannedCall[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.calls)) {
    for (const c of o.calls) {
      if (!c || typeof c !== "object") continue;
      const tool = (c as { tool?: unknown }).tool;
      if (typeof tool !== "string" || !knownTools.has(tool)) continue; // כלי לא מוכר = מתעלמים (לעולם לא מריצים שם שהמודל המציא)
      const rawArgs = (c as { args?: unknown }).args;
      const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {};
      const key = tool + JSON.stringify(args);
      if (seen.has(key)) continue;
      seen.add(key);
      calls.push({ tool, args });
      if (calls.length >= MAX_TOOL_CALLS) break;
    }
  }
  const reply = typeof o.reply === "string" && o.reply.trim() ? o.reply.trim() : null;
  return { calls, reply };
}

// ---------------------------------------------------------------------------------------------------------------------
// ניקוי נתונים לפני שליחה למודל / ללקוח

/** חותך מחרוזת נתונים (שם, כותרת, הערה): בלי תווי בקרה, בלי שורות חדשות, עם חיתוך */
export function dataStr(v: unknown, max = 120): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![\d])(?:\+?972[-\s]?|0)(?:[2-9]|5\d)[-\s]?\d{3}[-\s]?\d{4}(?![\d])/g;
const LONG_SECRET_RE = /\b(?:[A-Za-z0-9_-]{32,})\b/g;

/** מסתיר כתובות מייל, טלפונים וצירופים ארוכים שנראים כמו אסימון – בטקסט חופשי שמגיע מנתונים (הערות, דיווחים, יומן) */
export function scrubFreeText(s: string): string {
  return s
    .replace(EMAIL_RE, "[מייל]")
    .replace(PHONE_RE, "[טלפון]")
    .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "[hash]")
    .replace(LONG_SECRET_RE, (m) => (/\d/.test(m) && /[A-Za-z]/.test(m) ? "[אסימון]" : m));
}

/** מחליף "קבלת מסר" כבד: JSON של תוצאות הכלים, חתוך לגודל מקסימלי (חותך מערכים ארוכים תחילה) */
export function packToolResults(results: { tool: string; ok: boolean; data?: unknown; error?: string }[], maxChars = MAX_TOOL_RESULT_CHARS): string {
  let json = JSON.stringify(results);
  if (json.length <= maxChars) return json;
  // חיתוך הדרגתי של מערכים ארוכים
  for (const limit of [30, 15, 8, 4]) {
    const trimmed = JSON.parse(JSON.stringify(results), (_k, v) => (Array.isArray(v) && v.length > limit ? [...v.slice(0, limit), `… ועוד ${v.length - limit}`] : v));
    json = JSON.stringify(trimmed);
    if (json.length <= maxChars) return json;
  }
  return json.slice(0, maxChars) + '…"[נחתך]"';
}

/** נתיבי ניהול (בלבד) שמותר להפוך לקישור בתשובה */
export function adminPathsIn(text: string): string[] {
  return [...new Set(text.match(/\/admin(?:\/[a-z0-9_-]+)*/g) ?? [])];
}

// ---------------------------------------------------------------------------------------------------------------------
// מפת מסכי הניהול – לשאלות "איפה עושים X". חייבת להישאר מסונכרנת עם src/components/admin/admin-nav.tsx

export const ADMIN_MAP = `מסכי הניהול (נתיב – מה יש שם):
/admin – לוח בקרה
/admin/inbox – הודעות למנהלת (פניות "צור קשר")
/admin/categories – עץ הקטגוריות (מקצועות, יחידות, פרקים)
/admin/materials – חומרים: העלאה, עריכה, מחיר, גישה (חינם/בתשלום), השהיה/פרסום
/admin/drive – סייר דרייב
/admin/users – משתמשות: חיפוש, תפקיד, השהיה, הערות, רכישה ידנית
/admin/fixes – בקשות שינוי בקבצים (תיקונים שמורות ביקשו), גרסאות פרטיות, חיבור ג'מיני
/admin/offers – הצעות מכירה
/admin/coupons – קופונים פרטיים
/admin/forum – פורום ודיווחים על תוכן
/admin/sichot – שיחות מורות (מאגר שיחות)
/admin/mail – מיילים: יומן שליחה ושליחה ידנית
/admin/online – מי מחוברת כעת
/admin/activity – פעילות וגלישה
/admin/downloads – היסטוריית הורדות; /admin/downloads/audit – בדיקת הרשאות הורדה
/admin/stats – סטטיסטיקות
/admin/logs – לוג פעולות מנהלות
/admin/agent – סוכן קלוד (יומן הסוכן שמטפל בדיווחי תקלות)
/admin/finance – כספים; /admin/subscriptions – מנויים; /admin/payments – תשלומים (נדרים פלוס)
/admin/settings – הגדרות האתר
/admin/error-reports – דיווחי תקלות ושאלות`;

/** "dana@gmail.com" → "d***@gmail.com" (מספיק לזיהוי בין כמה התאמות, בלי לשלוח כתובת מלאה למודל) */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "[מייל]";
  return email.slice(0, 1) + "***" + email.slice(at);
}
