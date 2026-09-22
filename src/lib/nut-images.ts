import type { StaticImageData } from "next/image";
import one01 from "../../public/images/nuts/one-01.webp";
import one02 from "../../public/images/nuts/one-02.webp";
import one03 from "../../public/images/nuts/one-03.webp";
import one04 from "../../public/images/nuts/one-04.webp";
import one05 from "../../public/images/nuts/one-05.webp";
import one06 from "../../public/images/nuts/one-06.webp";
import one07 from "../../public/images/nuts/one-07.webp";
import one08 from "../../public/images/nuts/one-08.webp";
import one09 from "../../public/images/nuts/one-09.webp";
import one10 from "../../public/images/nuts/one-10.webp";
import two01 from "../../public/images/nuts/two-01.webp";
import two02 from "../../public/images/nuts/two-02.webp";
import two03 from "../../public/images/nuts/two-03.webp";
import two04 from "../../public/images/nuts/two-04.webp";
import two05 from "../../public/images/nuts/two-05.webp";
import two06 from "../../public/images/nuts/two-06.webp";
import two07 from "../../public/images/nuts/two-07.webp";
import many01 from "../../public/images/nuts/many-01.webp";
import many02 from "../../public/images/nuts/many-02.webp";
import many03 from "../../public/images/nuts/many-03.webp";
import many04 from "../../public/images/nuts/many-04.webp";
import many05 from "../../public/images/nuts/many-05.webp";
import many06 from "../../public/images/nuts/many-06.webp";
import many07 from "../../public/images/nuts/many-07.webp";
import many08 from "../../public/images/nuts/many-08.webp";
import many09 from "../../public/images/nuts/many-09.webp";
import many10 from "../../public/images/nuts/many-10.webp";
import many11 from "../../public/images/nuts/many-11.webp";
import many12 from "../../public/images/nuts/many-12.webp";
import many13 from "../../public/images/nuts/many-13.webp";
import many14 from "../../public/images/nuts/many-14.webp";
import many15 from "../../public/images/nuts/many-15.webp";
import many16 from "../../public/images/nuts/many-16.webp";

/**
 * תמונות האגוזים לראש דף תיקייה, לפי סוג התיקייה — נחתכו מהגיליון "אגוזי לוז הרבה דגמים"
 * (קבוצות לפי מספר האגוזים שנראים בתמונה; קבוצת "one" נחתכה מהקובץ "אגוז לוז אחד"):
 *  - many: תיקייה ראשית (מקצוע) — כמה אגוזים
 *  - two:  תיקייה אמצעית — שני אגוזים
 *  - one:  תיקייה סופית (כבר יש בה חומרים) — אגוז אחד
 */
const NUTS = {
  one: [one01, one02, one03, one04, one05, one06, one07, one08, one09, one10],
  two: [two01, two02, two03, two04, two05, two06, two07],
  many: [
    many01, many02, many03, many04, many05, many06, many07, many08,
    many09, many10, many11, many12, many13, many14, many15, many16,
  ],
} satisfies Record<string, StaticImageData[]>;

export type NutKind = keyof typeof NUTS;

/** בחירה מחזורית לפי אינדקס: ערכים עוקבים תמיד נותנים תמונות שונות (כל עוד בקבוצה יותר מתמונה אחת) */
export function pickNut(kind: NutKind, index: number): StaticImageData {
  const list = NUTS[kind];
  return list[Math.abs(index) % list.length];
}

/** hash יציב (לא תלוי-סביבה) לשם המקצוע, כדי שלכל מקצוע יהיה "מסלול אגוזים" קבוע משלו */
function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** סוג האגוז נקבע לפי עומק התיקייה בלבד — כך שכל התיקיות באותה רמה נראות זהות */
function kindForDepth(depth: number): NutKind {
  return depth <= 0 ? "many" : depth === 1 ? "two" : "one";
}

/**
 * תמונת האגוז של תיקייה, לפי המקצוע השורשי והעומק שלה בעץ (0 = המקצוע עצמו).
 *
 * הכלל: **אותו מקצוע + אותה רמה = בדיוק אותה תמונה** (למשל "תורה 5 יחידות" ו"תורה 3 יחידות"),
 * רמה אחת פנימה = תמונה אחרת (אבל שוב זהה לכל האחיות שלה), ומקצוע אחר = מסלול תמונות אחר —
 * כך יש גיוון בין המקצועות, וכל התמונות עדיין מאותו גיליון אגוזי לוז, כלומר נראות כאותו אגוז.
 */
export function nutForLevel(rootKey: string, depth: number): StaticImageData {
  return pickNut(kindForDepth(depth), hashKey(rootKey) + depth);
}
