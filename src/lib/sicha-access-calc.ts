/**
 * גישה לחומרי מקצוע תמורת העלאת שיחה (שיחה / חברה / כישורי חיים).
 * כל שיחה פעילה במקצוע נותנת SICHA_ACCESS_MONTHS חודשי גישה לחומרי אותו מקצוע בלבד; שיחות נוספות מוסיפות
 * עוד, עד תקרה של SICHA_ACCESS_CAP_MONTHS חודשים קדימה מרגע ההעלאה האחרונה. אין טבלה: הגישה מחושבת מתאריכי
 * השיחות הפעילות, ולכן מחיקה/השעיה של שיחה מורידה אותה מהחישוב מעצמה. פונקציה טהורה – אין תלות ב-DB.
 */
export const SICHA_ACCESS_MONTHS = 3;
export const SICHA_ACCESS_CAP_MONTHS = 12;

function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setMonth(r.getMonth() + n);
  return r;
}

/** תאריך סיום הגישה לפי תאריכי ההעלאה של השיחות הפעילות; null אם אין שיחות */
export function sichaAccessEnd(createdAts: Date[]): Date | null {
  if (createdAts.length === 0) return null;
  const sorted = [...createdAts].sort((a, b) => a.getTime() - b.getTime());
  let end: Date | null = null;
  for (const c of sorted) {
    const base: Date = end !== null && end.getTime() > c.getTime() ? end : c;
    const cap = addMonths(c, SICHA_ACCESS_CAP_MONTHS);
    let next = addMonths(base, SICHA_ACCESS_MONTHS);
    if (next.getTime() > cap.getTime()) next = cap;
    if (end === null || next.getTime() > end.getTime()) end = next;
  }
  return end;
}
