import { nutNameForLevel } from "./nut-images";

/** ר' הערה בראש src/lib/inline-images.ts – נתיבי קובץ בלבד. */

export function inlineSite(src: string, _variant?: string): string {
  void _variant;
  return src;
}

/** תמונת האגוז של תיקייה (אותה בחירה כמו nutForLevel) */
export function inlineNut(rootKey: string, depth: number): string {
  return `/images/nuts/${nutNameForLevel(rootKey, depth)}.webp`;
}
