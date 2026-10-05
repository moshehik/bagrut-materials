/**
 * תאריכים עבריים – בלי ספרייה חיצונית, על גבי Intl (לוח עברי מובנה בדפדפן וב-Node).
 * לשימוש בשרת ובלקוח. הפורמט: "כ״ד בתשרי תשפ״ז".
 * התאריך האזרחי נקבע לפי שעון ישראל (בלי התחשבות בשקיעה).
 */

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];

/** מספר באותיות עבריות (גימטריה) עם גרש/גרשיים: 24 → כ״ד, 5 → ה׳, 787 → תשפ״ז */
export function gematria(n: number): string {
  const rest = n % 100;
  let s = HUNDREDS[Math.floor(n / 100)] ?? "";
  if (rest === 15) s += "טו";
  else if (rest === 16) s += "טז";
  else s += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  if (s.length <= 1) return s + "׳";
  return s.slice(0, -1) + "״" + s.slice(-1);
}

/** שנה עברית באותיות, בלי האלפים: 5787 → תשפ״ז */
export const gematriaYear = (year: number) => gematria(year % 1000);

const enParts = new Intl.DateTimeFormat("en-u-ca-hebrew", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const heMonth = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { month: "long", timeZone: "UTC" });
const jerusalemYmd = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type HebrewParts = { year: number; monthKey: string; monthName: string; day: number };

/** תאריך עברי של רגע UTC (בצהריים UTC, כדי שלא יהיו סטיות אזור זמן) */
function partsOfUtc(d: Date): HebrewParts {
  const p = enParts.formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    monthKey: get("month"),
    monthName: heMonth.format(d),
    day: Number(get("day")),
  };
}

/** תאריך לוח אזרחי (YYYY-MM-DD) לפי שעון ישראל של רגע נתון */
export function jerusalemIso(d: Date | string | number): string {
  return jerusalemYmd.format(new Date(d));
}

const noonUtc = (iso: string) => new Date(`${iso}T12:00:00Z`);

export function isoToHebrew(iso: string): HebrewParts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = noonUtc(iso);
  return Number.isNaN(d.getTime()) ? null : partsOfUtc(d);
}

export function currentHebrewYear(now: Date = new Date()): number {
  return partsOfUtc(noonUtc(jerusalemIso(now))).year;
}

/** "כ״ד בתשרי תשפ״ז" ; עם withTime – גם שעה ("כ״ד בתשרי תשפ״ז · 14:05") */
export function formatHebrewDate(
  d: Date | string | number | null | undefined,
  withTime = false,
): string {
  if (d === null || d === undefined || d === "") return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const h = partsOfUtc(noonUtc(jerusalemIso(date)));
  const text = `${gematria(h.day)} ב${h.monthName} ${gematriaYear(h.year)}`;
  if (!withTime) return text;
  const time = date.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
  return `${text} · ${time}`;
}

export type HebrewMonth = { key: string; name: string; firstMs: number; days: number };

const monthsCache = new Map<number, HebrewMonth[]>();

/** חודשי שנה עברית לפי הסדר (תשרי…אלול; בשנה מעוברת – אדר א׳ ואדר ב׳), עם תאריך הלועזי של ה-1 לכל חודש */
export function hebrewMonths(year: number): HebrewMonth[] {
  const cached = monthsCache.get(year);
  if (cached) return cached;
  const months: HebrewMonth[] = [];
  // ראש השנה של שנה עברית Y נופל בספטמבר–אוקטובר של Y-3760, אז סורקים מסוף אוגוסט
  const start = Date.UTC(year - 3761, 7, 25, 12);
  for (let i = 0; i < 460; i++) {
    const ms = start + i * 86_400_000;
    const p = partsOfUtc(new Date(ms));
    if (p.year !== year) continue;
    const last = months[months.length - 1];
    if (last && last.key === p.monthKey) last.days = p.day;
    else months.push({ key: p.monthKey, name: p.monthName, firstMs: ms, days: p.day });
  }
  monthsCache.set(year, months);
  return months;
}

/** המרה מתאריך עברי לתאריך לועזי (YYYY-MM-DD); null אם התאריך לא קיים */
export function hebrewToIso(year: number, monthKey: string, day: number): string | null {
  const m = hebrewMonths(year).find((x) => x.key === monthKey);
  if (!m || day < 1 || day > m.days) return null;
  return new Date(m.firstMs + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** התאריך העברי של היום (שעון ישראל) */
export function hebrewToday(now: Date = new Date()): HebrewParts {
  return partsOfUtc(noonUtc(jerusalemIso(now)));
}

const weekdayHe = new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "UTC" });
/** שם היום בשבוע ("יום ראשון") לתאריך לועזי YYYY-MM-DD */
export function weekdayName(iso: string): string {
  return weekdayHe.format(noonUtc(iso));
}

/** החודש הקודם/הבא ברצף השנים העבריות */
export function neighborMonth(year: number, key: string, dir: 1 | -1): { year: number; key: string } {
  const ms = hebrewMonths(year);
  const i = ms.findIndex((m) => m.key === key);
  const j = i + dir;
  if (j >= 0 && j < ms.length) return { year, key: ms[j].key };
  if (dir > 0) return { year: year + 1, key: hebrewMonths(year + 1)[0].key };
  const prev = hebrewMonths(year - 1);
  return { year: year - 1, key: prev[prev.length - 1].key };
}

/** שם היום להורדות: ביום שבת ההורדות הן של מוצאי שבת (אף מורה לא מורידה בשבת עצמה) */
export function downloadDayName(iso: string): string {
  return noonUtc(iso).getUTCDay() === 6 ? "מוצאי שבת" : weekdayName(iso);
}
