/**
 * חצות לפי שעון ישראל (Asia/Jerusalem), בלי תלות באזור הזמן של השרת (בוורסל השרת ב-UTC – "היום" התחיל ב-02:00/03:00 בלילה בישראל).
 * משמש למכסת ההורדות היומית ולמונים "היום" בלוח הניהול.
 */
export const IL_TZ = "Asia/Jerusalem";

export function startOfIsraelDay(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IL_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000; // הפרש שעון ישראל מ-UTC (חורף 2h, קיץ 3h)
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day")) - offset);
}
