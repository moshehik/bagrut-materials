import "server-only";
import { INLINE_SITE } from "./inline-site-images.generated";
import { nutNameForLevel } from "./nut-images";

/**
 * תמונות אתר סטטיות (לוגואים, דף הבית, אגוזי כרטיסי התיקיות) שמוטמעות ב-HTML כ-data URI של WebP במקום להיטען כקובץ —
 * כי מסנן התוכן (אתרוג) מחליף חלק מקובצי התמונה הרגילים בריבוע מטושטש, ותמונה מוטמעת עוברת.
 * מקור וגדלים: scripts/gen-inline-site-images.cjs. מיובא רק מקומפוננטות שרת — לא להכניס ל-bundle של הדפדפן.
 */

/** נתיב ("/images/logo-black.png") → data URI; אם אין כזה — הנתיב המקורי. variant = גרסת גודל ("sm", "home"). */
export function inlineSite(src: string, variant?: string): string {
  const rel = src.replace(/^\/images\//, "");
  return INLINE_SITE[variant ? `${rel}@${variant}` : rel] ?? INLINE_SITE[rel] ?? src;
}

/** תמונת האגוז של תיקייה (אותה בחירה כמו nutForLevel) כ-data URI */
export function inlineNut(rootKey: string, depth: number): string {
  return inlineSite(`/images/nuts/${nutNameForLevel(rootKey, depth)}.webp`);
}

/** שדה CSS: מוסיף משתנה-CSS עם url(data:…) לשימוש ב-style של אלמנט (נורשים בעץ, כך שמגדירים פעם אחת על העוטף) */
export function cssUrlVar(name: `--${string}`, src: string, variant?: string): Record<string, string> {
  return { [name]: `url("${inlineSite(src, variant)}")` };
}
