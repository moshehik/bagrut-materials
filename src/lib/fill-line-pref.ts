/**
 * הגדרה אישית של מורה: יחס אורך קווי-המילוי ("____") בדפים שהיא מורידה/צופה בהם.
 *
 * נשמר כאחוזים שלמים (100 = כמו שהקובץ נבנה = ברירת המחדל, בלי שום שינוי) כדי לא להתעסק בנקודה צפה.
 * קובץ-טהור בכוונה (בלי DB ובלי jszip) - אפשר לייבא גם מרכיב לקוח (חלונית ההגדרה) וגם מבדיקות.
 * ההחלה בפועל: docx-fill-scale.ts (בזמן-הגשה, לפני ההמרה ל-PDF); הקריאה/כתיבה מה-DB: user-prefs.ts.
 */

export const FILL_LINE_PERCENT_DEFAULT = 100;
export const FILL_LINE_PERCENT_MIN = 50;
export const FILL_LINE_PERCENT_MAX = 200;
/** צעד ההגדרה. מגביל את מספר הווריאציות שנוצרות במטמון ה-PDF (כל יחס שונה = רשומת מטמון נפרדת) */
export const FILL_LINE_PERCENT_STEP = 10;

/**
 * מנרמל כל ערך לאחוז חוקי: לא-מספר / ריק / null → ברירת המחדל; אחרת מעוגל לצעד הקרוב ומוגבל לטווח.
 * לעולם לא זורק.
 */
export function clampFillLinePercent(value: unknown): number {
  if (value === null || value === undefined || value === "") return FILL_LINE_PERCENT_DEFAULT;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return FILL_LINE_PERCENT_DEFAULT;
  const stepped = Math.round(n / FILL_LINE_PERCENT_STEP) * FILL_LINE_PERCENT_STEP;
  return Math.min(FILL_LINE_PERCENT_MAX, Math.max(FILL_LINE_PERCENT_MIN, stepped));
}

/** אחוז → מקדם כפל (100 → 1). גם מנרמל, כך שערך פגום מה-DB לא ישבש קובץ */
export function fillLinePercentToScale(percent: unknown): number {
  return clampFillLinePercent(percent) / 100;
}

/** האפשרויות הנפרדות לחלונית הבחירה (50, 60, … 200) */
export function fillLinePercentOptions(): number[] {
  const out: number[] = [];
  for (let p = FILL_LINE_PERCENT_MIN; p <= FILL_LINE_PERCENT_MAX; p += FILL_LINE_PERCENT_STEP) out.push(p);
  return out;
}
