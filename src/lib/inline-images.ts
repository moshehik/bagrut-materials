/**
 * עוטפי נתיב לתמונות (בתי המקצועות, אייקוני השיעור, כרטיסיות, אגוזים, לוגואים) – מחזירים נתיב קובץ רגיל.
 * שמות הפונקציות נשארו מתקופת ההטמעה כ-data URI, שהוסרה ב-2026-11-07 אחרי בדיקה אצל נטפרי (/netfree-test/images.html):
 * מסנן התוכן סורק כל תמונה לפי כתובת ומציג "התמונה לא נבדקה" לכל תמונה מוטמעת (data URI ב-HTML / ב-CSS / ב-JS / ב-SVG)
 * וגם לקובץ מוצפן; ואילו קובץ תמונה רגיל נבדק פעם אחת אצלם ואז עובר. בנוסף, data URI בתוך ה-HTML שבש את נתוני
 * ה-RSC של העמוד והדף קרס בטעינה ישירה. לכן: רק קובצי תמונה רגילים עם כתובת קבועה (לא משנים שם/תוכן בלי צורך) –
 * ודף /netfree-test/all-images.html טוען את כולם יחד כדי שנטפרי יבדוק אותם מראש.
 */

/** נתיב בית ("/images/houses/house-dinim.png") */
export function inlineHouse(src: string | undefined): string | undefined {
  return src;
}

/** שם אייקון שיעור ("enrichment" וכו') → נתיב הקובץ */
export function inlineLessonIcon(art: string): string {
  return `/images/lesson-icons-v2/${art}.png`;
}

/** תמונת ממשק של כרטיסיות החומרים ("/images/mat-cards/...", "/images/nuts/...") */
export function inlineUi(src: string): string {
  return src;
}
