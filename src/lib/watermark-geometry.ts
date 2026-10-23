/**
 * גאומטריה של סימן המים האלכסוני (טהור, בלי תלות בשרת – נבדק ב-scripts/watermark-geometry.test.ts).
 *
 * הבעיה שתוקנה (2026-10-23, בדיקת PDF אמיתי "דף לתלמידה - פרק טו"): הטקסט האלכסוני (מספר אישי + אימייל + טלפון, ברוחב ~823pt)
 * הותחל מנקודה שרירותית (`width/2 - dw/2.6`) ויצא מקצה העמוד הימני – כ-100pt (ספרות הטלפון) נחתכו. עכשיו גודל הגופן מתכווץ כך
 * שהשורה כולה נכנסת בעמוד (עם שוליים), והיא ממורכזת על מרכז העמוד לפי הזווית.
 */
export const DIAGONAL_DEG = 32;
/** כמה מהאורך האפשרי לאורך האלכסון (לפי רוחב/גובה העמוד) מותר לתפוס */
const FIT_RATIO = 0.92;
/** חצי גובה אותיות ביחס לגודל הגופן – כדי למרכז אנכית את השורה סביב קו הבסיס */
const HALF_X_HEIGHT = 0.35;

/** גודל גופן לשורה אלכסונית ברוחב `widthAt1` (באורך מחרוזת בגודל 1): הרגיל, או קטן יותר כדי שהשורה תיכנס בעמוד */
export function fitDiagonalSize(pageW: number, pageH: number, widthAt1: number): number {
  const rad = (DIAGONAL_DEG * Math.PI) / 180;
  const base = Math.max(18, Math.min(pageW, pageH) / 18);
  if (!(widthAt1 > 0)) return base;
  const maxLen = FIT_RATIO * Math.min(pageW / Math.cos(rad), pageH / Math.sin(rad));
  return Math.max(10, Math.min(base, maxLen / widthAt1));
}

/**
 * נקודת ההתחלה (קו בסיס, שמאל) של שורה אלכסונית ברוחב `textW`, ממורכזת על מרכז העמוד, ומוסטת `offsetBelow` מתחת לשורה הראשית
 * (בניצב לה). pdf-lib מסובב סביב נקודת ההתחלה, ולכן מחשבים אותה במפורש.
 */
export function diagonalOrigin(pageW: number, pageH: number, textW: number, size: number, offsetBelow = 0) {
  const rad = (DIAGONAL_DEG * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const drop = HALF_X_HEIGHT * size + offsetBelow;
  return {
    x: pageW / 2 - (textW / 2) * cos + drop * sin,
    y: pageH / 2 - (textW / 2) * sin - drop * cos,
  };
}

/** נקודת הסוף של שורה (לבדיקה שנכנסת בעמוד) */
export function diagonalEnd(origin: { x: number; y: number }, textW: number) {
  const rad = (DIAGONAL_DEG * Math.PI) / 180;
  return { x: origin.x + textW * Math.cos(rad), y: origin.y + textW * Math.sin(rad) };
}
