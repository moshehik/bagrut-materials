/**
 * שינוי אורך קווי-המילוי ("____") לפי ההגדרה האישית של המורה (ר' fill-line-pref.ts), בזמן-הגשה, לפני ההמרה ל-PDF.
 *
 * הקובץ השמור בדרייב לא משתנה - רק הבייטים שנשלחים להמרה (כמו שאר תיקוני-ההגשה). יחס 1 (ברירת המחדל) =
 * אותם בייטים בדיוק, כלומר שום שינוי לאף מורה שלא הגדירה כלום.
 *
 * מה נחשב "קו מילוי": ריצה של MIN_SCALED_RUN קווים תחתונים ומעלה בתוך `<w:t>` אחד (כולל ריצה "שבירה" שנבנתה עם
 * רווח-אפס-רוחב U+200B כל 8 קווים - ר' breakLongBlanksXml ב-docx-blank-lines.ts). ריצות קצרות יותר (1-2) הן לא
 * קו מילוי (קו הפרדה/סימון) ולא נוגעים בהן. שורות-כתיבה שנבנו מגבול-פסקה (pBdr) הן לא קווים תחתונים ולא מושפעות.
 *
 * הסדר חשוב: רץ בתוך fixBlankLinesXml אחרי המרת "חורי-רווחים" לקווים ולפני יצירת הקווים השבירים ושחרור היישור,
 * כדי שקו שהתארך יטופל כמו כל קו ארוך (שביר, ולא מותח את השורה שלפניו) וקו שהתקצר שמתחת לסף לא ישוחרר סתם.
 *
 * בלי "server-only" בכוונה - נקרא מ-driveBridgeCore.ts שסקריפטים עצמאיים מייבאים ישירות.
 */

const ZWSP = "​";
/** מכמה קווים בריצה היא "קו מילוי" שמותאם (מתחת לזה - מסמן/מפריד, לא נוגעים) */
export const MIN_SCALED_RUN = 3;
/** תקרת בטיחות לריצה אחת אחרי ההגדלה */
const MAX_RUN = 400;
const BREAK_EVERY = 8;

/** ריצת קווים תחתונים, כולל U+200B בתוכה (ומסתיימת בקו, לא ב-U+200B: רווח-אפס-רוחב סופי נשמר מחוץ לריצה) */
const RUN_RE = /_(?:[_​]*_)?/g;

/** כמה קווים בריצה אחרי הפעלת המקדם. מתחת ל-MIN_SCALED_RUN לא יורדים - קו מילוי לא נעלם. */
export function scaledRunLength(n: number, scale: number): number {
  return Math.min(MAX_RUN, Math.max(MIN_SCALED_RUN, Math.round(n * scale)));
}

/**
 * הליבה: word/document.xml → אותו XML עם קווי-מילוי באורך מוכפל, או null אם אין מה לשנות
 * (מקדם 1 / לא תקין / אין קווים). טהור וסינכרוני. נוגע רק בתוכן של `<w:t>` - לא בתגיות ולא בטקסט מחוק/הוראות שדה.
 */
export function scaleFillLinesXml(xml: string, scale: number): string | null {
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return null;
  let changed = false;
  const out = xml.replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (all, open: string, text: string, close: string) => {
    if (!text.includes("___")) return all;
    const next = text.replace(RUN_RE, (run) => {
      const n = run.replace(/​/g, "").length;
      if (n < MIN_SCALED_RUN) return run;
      const m = scaledRunLength(n, scale);
      if (m === n) return run;
      // קו שנבנה "שביר" (יש בו U+200B) נשאר שביר: רווח-אפס-רוחב אחרי כל 8; אחרת - קווים רציפים,
      // ושלב ה-breakLongBlanksXml שאחרינו יהפוך ריצה ארוכה לשבירה כמו כל קו ארוך אחר
      if (!run.includes(ZWSP)) return "_".repeat(m);
      let s = "";
      for (let i = 0; i < m; i += BREAK_EVERY) s += (i > 0 ? ZWSP : "") + "_".repeat(Math.min(BREAK_EVERY, m - i));
      return s;
    });
    if (next === text) return all;
    changed = true;
    return open + next + close;
  });
  return changed ? out : null;
}
