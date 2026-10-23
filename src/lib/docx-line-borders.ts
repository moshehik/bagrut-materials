/**
 * תיקון בזמן-הגשה: שורות כתיבה (פסקאות ריקות עם קו תחתון) שמתמזגות לקו אחד ב-PDF, לפני ההמרה
 * (לצד docx-blank-lines.ts).
 *
 * הבעיה (אומתה 2026-10-23 ברינדור של ההמרה האמיתית בשרת Oracle, "דף הכנה ובקיאות - פרק יג" של
 * בשלח): בקבצים שורות הכתיבה הן פסקאות ריקות רצופות עם `w:pBdr/w:bottom`. כשהקווים זהים,
 * מיזוג-הגבולות של LibreOffice (וגם של Word) מצייר רק קו אחד, בתחתית הקבוצה, ומעליו נשאר רווח
 * ריק. התיקון המקומי הקודם (החלפת `w:space` בין 6 ל-7, 2026-10-04) אומת רק ברינדור Word, ו-LibreOffice
 * מתעלם מההבדל הזה - לכן ב-PDF של האתר חסרים קווים. הבדל קטן בצבע (999999 / 999998) כן שובר את
 * המיזוג ואינו נראה לעין.
 *
 * הפתרון: ברצף פסקאות ריקות סמוכות שהגבול היחיד שלהן הוא `bottom`, בכל פסקה שנייה מזיזים את
 * ספרת הצבע האחרונה ב-1. לא נוגעים בפסקאות עם טקסט (למשל מסגרות ציטוט שמיועדות להתמזג),
 * בפסקאות עם גבול נוסף (top/left/right/between). צבע "auto" (שחור) הופך ל-000001 בכל פסקה שנייה. הקובץ בדרייב לא משתנה. כמו
 * docx-blank-lines: חייב לרוץ *לפני* חישוב מפתח מטמון ה-PDF (md5), ר' prepareOfficeForConvert
 * ב-driveBridgeCore.ts. בלי "server-only" בכוונה - סקריפטים עצמאיים מייבאים את driveBridgeCore.
 */

import JSZip from "jszip";

const PARAGRAPH = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
const BOTTOM_ONLY = /<w:pBdr>\s*<w:bottom\s([^>]*)\/>\s*<\/w:pBdr>/;

/** פסקה ללא טקסט נראה ללא ציור/אובייקט - שורת כתיבה */
function isEmptyParagraph(p: string): boolean {
  if (/<w:(drawing|pict|object|br)\b/.test(p)) return false;
  for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) if (m[1].trim() !== "") return false;
  return true;
}

/** מזיז את ספרת הצבע האחרונה ב-1 (9→8, 0→1) - הבדל שאינו נראה לעין. "auto" (שחור) הופך ל-000001 */
function nudgeColor(hex: string): string {
  if (hex.toLowerCase() === "auto") return "000001";
  const last = parseInt(hex[hex.length - 1], 16);
  const digit = last === 0 ? 1 : last - 1;
  return hex.slice(0, -1) + digit.toString(16).toUpperCase();
}

type Info = { color: string; attrs: string } | null;

/** פרטי קו-כתיבה של פסקה (או null אם אינה שורת כתיבה רגילה) */
function lineInfo(p: string): Info {
  if (!isEmptyParagraph(p)) return null;
  const m = p.match(BOTTOM_ONLY);
  if (!m) return null;
  const color = m[1].match(/w:color="([0-9A-Fa-f]{6}|auto)"/i)?.[1];
  if (!color) return null;
  return { color, attrs: m[1] };
}

/**
 * הליבה: מקבל XML של חלק-מסמך (word/document.xml) ומחזיר אותו אחרי ההפרדה, או null אם אין מה
 * לשנות. טהור וסינכרוני - נוח לבדיקות ולסקריפטים.
 */
export function separateLineBordersXml(xml: string): string | null {
  const paras = [...xml.matchAll(PARAGRAPH)];
  if (paras.length < 2) return null;

  let out = "";
  let pos = 0;
  let changed = false;
  // סופרים מיקום בתוך רצף פסקאות-קו סמוכות; הרצף נקטע בכל פסקה אחרת ובכל טקסט/תג שביניהן
  let prevEnd = -1;
  let runIndex = 0;
  let prevColor = "";
  for (const m of paras) {
    const p = m[0];
    const start = m.index ?? 0;
    const info = lineInfo(p);
    const adjacent = prevEnd >= 0 && /^\s*$/.test(xml.slice(prevEnd, start));
    if (!info) {
      runIndex = 0;
      prevEnd = start + p.length;
      prevColor = "";
      continue;
    }
    runIndex = adjacent && prevColor !== "" ? runIndex + 1 : 0;
    let color = info.color;
    let para = p;
    // כל פסקה שנייה ברצף: צבע שונה מהקודמת (כך שאין שתי סמוכות זהות)
    if (runIndex > 0 && color.toUpperCase() === prevColor.toUpperCase()) {
      const nudged = nudgeColor(color);
      para = p.replace(/(<w:bottom\s[^>]*w:color=")(?:[0-9A-Fa-f]{6}|auto)(")/i, `$1${nudged}$2`);
      color = nudged;
      changed = true;
    }
    out += xml.slice(pos, start) + para;
    pos = start + p.length;
    prevEnd = pos;
    prevColor = color;
  }
  return changed ? out + xml.slice(pos) : null;
}

export async function separateLineBorders(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const entryName = ["word/document.xml", "word" + String.fromCharCode(92) + "document.xml"].find((n) => zip.file(n));
    if (!entryName) return bytes;
    const entry = zip.file(entryName)!;
    const patched = separateLineBordersXml(await entry.async("string"));
    if (patched === null) return bytes;
    // שימור ה-date המקורי כדי שהבייטים (ומפתח המטמון md5) יהיו יציבים בין בקשות
    zip.file(entryName, patched, { date: entry.date, createFolders: false });
    return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  } catch (e) {
    console.warn("[docx-line-borders] התיקון נכשל, ממירים את המקור:", e instanceof Error ? e.message : e);
    return bytes;
  }
}
