/**
 * תיקון בזמן-הגשה לניקוד בפסוקים, לפני ההמרה ל-PDF (לצד docx-blank-lines.ts).
 *
 * הבעיה (אומתה ברינדור של ההמרה האמיתית בשרת Oracle, 2026-10-22, "דף לתלמידה - גדעון"):
 * טקסט הפסוקים שנמשך מספריא מכיל קמץ קטן (U+05C7 ׇ) ולעיתים חולם חסר לו"ו (U+05BA ֺ) - סימני
 * יוניקוד "חדשים" שגופני FontBit של הפסוקים (FbToccido, FbPgisha) לא מכילים בכלל (יש בהם 16 מתוך
 * 18 סימני הניקוד; הקמץ הקטן והחולם-חסר חסרים). LibreOffice נופל לגופן חלופי (DejaVu Sans) רק
 * לסימן הזה, וכתוצאה מזה העיצוב של כל המילה נשבר: הסימן החלופי מצויר ענק, והאות שאחריו מצוירת
 * *על* האות שלפניה (במילה "וַתָּעׇז" ה-ע' יושבת על ה-ת'). Word על המחשב מסתיר את זה כי הוא מחליף
 * גופן למילה שלמה; בשרת ההמרה זה נראה כ"גופן שבור" בפסוקים בלבד.
 *
 * הפתרון: ממפים את הסימנים האלה לסימנים הקלאסיים שזהים להם בצורתם ושקיימים בכל גופן עברי:
 * קמץ קטן → קמץ (U+05B8), חולם חסר לו"ו → חולם (U+05B9). ההבדל ביניהם הוא סימון-קריאה מהדורתי
 * (מהדורות רבות של התנ"ך לא מבחינות כלל), ולא שינוי בטקסט - וההחלפה נעשית רק בבייטים שנשלחים
 * להמרה; הקובץ בדרייב לא משתנה. נוגעים רק בטקסט הנראה (`<w:t>`), בכל הגופנים (גם בגופן שיש בו
 * הסימן, הקמץ הרגיל נראה זהה), כדי לא להיות תלויים בפענוח ירושת-גופנים מסגנונות.
 *
 * כמו docx-blank-lines: חייב לרוץ *לפני* חישוב מפתח מטמון ה-PDF (md5), ר' prepareOfficeForConvert
 * ב-driveBridgeCore.ts. בלי "server-only" בכוונה - סקריפטים עצמאיים מייבאים את driveBridgeCore.
 */

import JSZip from "jszip";

/** סימן יוניקוד שחסר בגופני הפסוקים → הסימן הקלאסי הזהה לו בצורתו */
export const NIKUD_COMPAT_MAP: Readonly<Record<string, string>> = {
  "ׇ": "ָ", // קמץ קטן → קמץ
  "ֺ": "ֹ", // חולם חסר לו"ו → חולם
};

const COMPAT_CHARS = new RegExp(`[${Object.keys(NIKUD_COMPAT_MAP).join("")}]`, "g");

/** טקסט נראה בלבד: `<w:t>` (לא instrText/delText, לא מאפיינים) */
const W_T = /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g;

/**
 * הליבה: מקבל XML של חלק-מסמך (word/document.xml) ומחזיר אותו אחרי ההחלפה, או null אם אין
 * מה לשנות. טהור וסינכרוני - נוח לבדיקות ולסקריפטים.
 */
export function normalizeNikudCompatXml(xml: string): string | null {
  if (!COMPAT_CHARS.test(xml)) return null;
  COMPAT_CHARS.lastIndex = 0;
  let changed = false;
  const out = xml.replace(W_T, (whole, open: string, text: string, close: string) => {
    const fixed = text.replace(COMPAT_CHARS, (ch) => NIKUD_COMPAT_MAP[ch] ?? ch);
    if (fixed === text) return whole;
    changed = true;
    return open + fixed + close;
  });
  return changed ? out : null;
}

/**
 * docx → docx עם word/document.xml מתוקן. מחזיר את הבייטים *המקוריים* (אותו אובייקט) אם אין
 * מה לשנות או אם משהו נכשל - לעולם לא זורק, כדי שתקלה כאן לא תפיל הורדה/תצוגה.
 * תומך גם בנתיב עם backslash ("word\document.xml") כמו docx-blank-lines.
 */
export async function normalizeNikudCompat(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const entryName = ["word/document.xml", "word" + String.fromCharCode(92) + "document.xml"].find((n) => zip.file(n));
    if (!entryName) return bytes;
    const entry = zip.file(entryName)!;
    const patched = normalizeNikudCompatXml(await entry.async("string"));
    if (patched === null) return bytes;
    // שימור ה-date המקורי: אחרת הבייטים (ומפתח המטמון md5) משתנים בכל בקשה; createFolders:false -
    // שלא תתווסף רשומת תיקייה "word/" (ר' docx-blank-lines.ts)
    zip.file(entryName, patched, { date: entry.date, createFolders: false });
    return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  } catch (e) {
    console.warn("[docx-nikud-compat] התיקון נכשל, ממירים את המקור:", e instanceof Error ? e.message : e);
    return bytes;
  }
}
