/**
 * עוטפי נתיב לתמונות שנטפרי נוטה להחליף (בתי המקצועות, אייקוני השיעור, כרטיסיות, אגוזים, לוגואים).
 * בכוונה מחזירים נתיב קובץ רגיל ולא data URI: תמונה מוטמעת בתוך ה-HTML נכנסה גם לנתוני ה-RSC של העמוד, נטפרי שיבש
 * אותה שם והדף קרס בטעינה ישירה (2026-11-07). ההחלפה לגרסה מוטמעת נעשית בדפדפן, רק לתמונה שנטפרי החליף –
 * ר' src/components/netfree-image-guard.tsx ו-scripts/gen-netfree-images.cjs (שם גם רשימת התמונות המכוסות).
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
