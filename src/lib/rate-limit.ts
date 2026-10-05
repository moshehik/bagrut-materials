import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * הגבלת קצב (rate limiting) מבוססת DB – חלון קבוע (fixed window) לכל מפתח.
 *
 * למה DB ולא זיכרון: Vercel הוא serverless – כל בקשה יכולה לרוץ על instance אחר, כך שמונה בזיכרון
 * לא רואה את הבקשות הקודמות. השורה בטבלת rate_limits היא "האמת" היחידה, ומתעדכנת ב-upsert אטומי אחד
 * (INSERT ... ON CONFLICT) – בלי מירוץ בין שתי בקשות מקבילות.
 *
 * מדיניות כשל (fail open): אם ה-DB לא זמין/איטי, הפונקציה רושמת שגיאה ומחזירה ok=true.
 * ההיגיון: הגבלת קצב היא שכבת הגנה משנית; עדיף שתקלת Neon רגעית לא תנעל את כל המשתמשות
 * מחוץ לאיפוס סיסמה / צור קשר / חיפוש. המחיר – בזמן תקלת DB אין הגנה מפני הצפה (ואז ממילא
 * רוב הפעולות שמוגנות כאן נכשלות בעצמן כי גם הן צריכות DB).
 */

/** ההודעה האחידה למשתמשת כשחרגה מהמכסה */
export const TOO_MANY_MESSAGE = "יותר מדי ניסיונות, נסי שוב בעוד כמה דקות";

export type RateLimitResult = {
  /** true = מותר להמשיך */
  ok: boolean;
  /** כמה ניסיונות נותרו בחלון הנוכחי (0 כשחרגה) */
  remaining: number;
  /** כמה שניות עד שהחלון מתאפס (0 כשמותר) */
  retryAfterSec: number;
};

/** אחת ל-N קריאות מנקים שורות שפג תוקפן (אין אינדקס – הטבלה קטנה, הניקוי זול) */
const CLEANUP_EVERY = 50;

/**
 * סופר ניסיון אחד למפתח ומחזיר אם הוא בתוך המכסה.
 * `limit` ניסיונות לכל `windowSec` שניות. הניסיון הראשון אחרי שפג החלון פותח חלון חדש.
 */
export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const { key, limit, windowSec } = opts;
  try {
    const interval = `${Math.max(1, Math.round(windowSec))} seconds`;
    // retry_after מחושב ב-SQL (לא ב-JS) כדי לא להסתבך עם אזורי זמן של timestamp בלי tz
    const res = await db.execute<{ count: number | string; retry_after: number | string }>(sql`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (${key}, 1, now() + ${interval}::interval)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + ${interval}::interval ELSE rate_limits.reset_at END
      RETURNING count, CEIL(EXTRACT(EPOCH FROM (reset_at - now())))::int AS retry_after
    `);
    const row = res.rows[0];
    if (!row) return { ok: true, remaining: limit, retryAfterSec: 0 };

    const count = Number(row.count);
    const retryAfterSec = Math.max(1, Number(row.retry_after) || 0);

    if (Math.random() < 1 / CLEANUP_EVERY) void cleanupExpired();

    if (count > limit) return { ok: false, remaining: 0, retryAfterSec };
    return { ok: true, remaining: Math.max(0, limit - count), retryAfterSec: 0 };
  } catch (e) {
    // fail open – ר' הסבר בראש הקובץ
    console.error("[rate-limit] failed (fail open)", e);
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}

/** נוחות: true אם חרגה מהמכסה (למשל: `if (await tooMany(limitKey("login", email), 5, 600)) return { error: TOO_MANY_MESSAGE }`) */
export async function tooMany(key: string, limit: number, windowSec: number): Promise<boolean> {
  return !(await rateLimit({ key, limit, windowSec })).ok;
}

/** מחיקת מונים שפג תוקפם – נקראת מדי פעם מתוך rateLimit, לא ממתינים לה ולא זורקת */
async function cleanupExpired() {
  try {
    await db.execute(sql`DELETE FROM rate_limits WHERE reset_at < now()`);
  } catch (e) {
    console.error("[rate-limit] cleanup failed", e);
  }
}

/**
 * בונה מפתח "scope:part:part…" – כל חלק מנורמל (trim + lowercase), וחלק ארוך מוחלף ב-hash קצר
 * כדי שהמפתח ייכנס ב-varchar(160). חלק ריק/חסר הופך ל-"-".
 */
export function limitKey(scope: string, ...parts: (string | number | null | undefined)[]): string {
  const norm = (p: string | number | null | undefined) => {
    const s = String(p ?? "").trim().toLowerCase();
    if (!s) return "-";
    if (s.length <= 48 && !/[\s:]/.test(s)) return s;
    return createHash("sha256").update(s).digest("hex").slice(0, 24);
  };
  return [scope.trim().toLowerCase(), ...parts.map(norm)].join(":").slice(0, 160);
}

/** ה-IP של הבקשה הנוכחית (הכתובת הראשונה ב-x-forwarded-for – כמו ב-audit.ts); "unknown" אם אין */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip")?.trim() ||
      h.get("cf-connecting-ip")?.trim() ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}
