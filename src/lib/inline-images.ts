import "server-only";
import { INLINE_HOUSES, INLINE_LESSON_ICONS, INLINE_UI } from "./inline-images.generated";

/**
 * תמונות שמוטמעות ב-HTML (data URI של WebP) במקום להיטען כקובץ נפרד — כי מסנן התוכן (אתרוג) מחליף חלק מקובצי
 * התמונה הרגילים (בתי המקצועות, אייקון "דף העשרה") בריבוע ריק / מטושטש, ותמונה מוטמעת עוברת. מקור: scripts/gen-inline-images.cjs.
 * מיובא רק מקומפוננטות שרת — לא להכניס ל-bundle של הדפדפן.
 */

/** נתיב בית (למשל "/images/houses/house-dinim.png") → data URI; אם אין — הנתיב המקורי. */
export function inlineHouse(src: string | undefined): string | undefined {
  if (!src) return src;
  const file = src.split("/").pop() ?? "";
  return INLINE_HOUSES[file] ?? src;
}

/** שם אייקון שיעור ("enrichment" וכו') → data URI; אם אין — הנתיב הרגיל. */
export function inlineLessonIcon(art: string): string {
  return INLINE_LESSON_ICONS[art] ?? `/images/lesson-icons-v2/${art}.png`;
}

/** תמונת ממשק של כרטיסיות החומרים ("/images/mat-cards/...", "/images/nuts/...") → data URI; אם אין — הנתיב המקורי. */
export function inlineUi(src: string): string {
  return INLINE_UI[src.replace(/^\/images\//, "")] ?? src;
}
