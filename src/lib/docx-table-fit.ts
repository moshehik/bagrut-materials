/**
 * תיקון בזמן-הגשה: טבלאות שרחבות מאזור הטקסט של הדף, לפני ההמרה ל-PDF (לצד docx-blank-lines.ts).
 *
 * הבעיה (אומתה 2026-10-22, "בוחן עם תשובות - פרק יג", תורה 3 יחידות בגרות חיצונית): הטבלאות בקבצים
 * נבנו ברוחב 9360 twips (6.5 אינץ', רוחב הטקסט של דף Letter עם שוליים של אינץ'), אבל הדף הוא A4 עם
 * שוליים של 1800 - אזור הטקסט הוא רק 8306. הטבלה חורגת 1054 twips (~1.9 ס"מ) מהשוליים: מעל הכותרות
 * והפסקאות שמסביב היא "בורחת" לשוליים. בסריקה של 2,276 docx מקומיים: 446 מתוך 591 הקבצים שיש
 * בהם טבלה חורגים, 428 מהם בדיוק באותם 1054.
 *
 * הפתרון: מכווצים פרופורציונלית את הטבלה לרוחב אזור הטקסט (gridCol, tcW ו-tblW בסוג dxa). טבלה
 * שנכנסת בדף, טבלה עם רוחב באחוזים, או טבלה שיש בתוכה טבלה מקוננת - לא נוגעים. הקובץ בדרייב לא
 * משתנה. כמו docx-blank-lines: חייב לרוץ *לפני* חישוב מפתח מטמון ה-PDF (md5), ר' prepareOfficeForConvert
 * ב-driveBridgeCore.ts. בלי "server-only" בכוונה - סקריפטים עצמאיים מייבאים את driveBridgeCore.
 */

import JSZip from "jszip";

/** חריגה קטנה מזו (twips) נחשבת תקינה - לא נוגעים */
const TOLERANCE = 20;

/** רוחב אזור הטקסט (twips) של כל מקטע, לפי סדר הופעתו; לכל מקטע המיקום שבו sectPr שלו מסתיים */
function sectionWidths(xml: string): { end: number; width: number }[] {
  const out: { end: number; width: number }[] = [];
  for (const m of xml.matchAll(/<w:sectPr[\s>][\s\S]*?<\/w:sectPr>/g)) {
    const s = m[0];
    const w = Number(s.match(/<w:pgSz[^>]*\sw:w="(\d+)"/)?.[1]);
    const l = Number(s.match(/<w:pgMar[^>]*\sw:left="(\d+)"/)?.[1]);
    const r = Number(s.match(/<w:pgMar[^>]*\sw:right="(\d+)"/)?.[1]);
    if (w > 0 && l >= 0 && r >= 0 && w - l - r > 0) out.push({ end: (m.index ?? 0) + s.length, width: w - l - r });
  }
  return out;
}

/** הטבלאות החיצוניות (עומק 0) כטווחי [start, end) - טבלה מקוננת נשארת בתוך החיצונית */
function outerTables(xml: string): { start: number; end: number; nested: boolean }[] {
  const out: { start: number; end: number; nested: boolean }[] = [];
  let depth = 0;
  let start = 0;
  let nested = false;
  for (const m of xml.matchAll(/<w:tbl>|<\/w:tbl>/g)) {
    if (m[0] === "<w:tbl>") {
      if (depth === 0) {
        start = m.index ?? 0;
        nested = false;
      } else nested = true;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) out.push({ start, end: (m.index ?? 0) + m[0].length, nested });
    }
  }
  return out;
}

/** מכווץ טבלה בודדת (XML שלה) כך שרוחבה יהיה `target`; null אם אין מה לשנות */
function fitTable(tbl: string, target: number): string | null {
  const gridMatch = tbl.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);
  if (!gridMatch) return null;
  const cols = [...gridMatch[0].matchAll(/<w:gridCol\s[^>]*w:w="(\d+)"/g)].map((m) => Number(m[1]));
  const gridSum = cols.reduce((a, b) => a + b, 0);
  if (gridSum <= 0) return null;

  const tblW = tbl.match(/<w:tblW\s[^>]*>/);
  const tblWType = tblW?.[0].match(/w:type="(\w+)"/)?.[1];
  if (tblWType === "pct") return null;
  const tblWVal = tblWType === "dxa" ? Number(tblW![0].match(/w:w="(\d+)"/)?.[1]) : 0;

  const ind = Number(tbl.match(/<w:tblInd\s[^>]*w:w="(-?\d+)"/)?.[1] ?? 0);
  const avail = target - Math.max(ind, 0);
  if (avail <= 0 || Math.max(gridSum, tblWVal) <= avail + TOLERANCE) return null;

  const f = avail / gridSum;
  // עמודות מעוגלות; האחרונה סופגת את שארית העיגול כדי שהסכום יהיה בדיוק avail
  const scaled = cols.map((c) => Math.floor(c * f));
  scaled[scaled.length - 1] += avail - scaled.reduce((a, b) => a + b, 0);

  let i = 0;
  let out = tbl.replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, (g) =>
    g.replace(/(<w:gridCol\s[^>]*w:w=")(\d+)(")/g, (_m, a: string, _v: string, c: string) => `${a}${scaled[i++] ?? 0}${c}`),
  );
  out = out.replace(/(<w:tcW\s[^>]*w:w=")(\d+)("[^>]*w:type="dxa")/g, (_m, a: string, v: string, c: string) => `${a}${Math.round(Number(v) * f)}${c}`);
  // סדר המאפיינים ב-tcW אינו מחייב (w:type לפני w:w) - מכסים גם את הסדר ההפוך
  out = out.replace(/(<w:tcW\s[^>]*w:type="dxa"[^>]*w:w=")(\d+)(")/g, (_m, a: string, v: string, c: string) => `${a}${Math.round(Number(v) * f)}${c}`);
  if (tblWType === "dxa") out = out.replace(/(<w:tblW\s[^>]*w:w=")(\d+)(")/, `$1${avail}$3`);
  return out;
}

/**
 * הליבה: מקבל XML של word/document.xml ומחזיר אותו אחרי הכיווץ, או null אם אין מה לשנות.
 * טהור וסינכרוני - נוח לבדיקות ולסקריפטים.
 */
export function fitTablesToPageXml(xml: string): string | null {
  const sections = sectionWidths(xml);
  if (sections.length === 0) return null;
  const tables = outerTables(xml);
  if (tables.length === 0) return null;

  let out = "";
  let pos = 0;
  let changed = false;
  for (const t of tables) {
    if (t.nested) continue;
    // המקטע של הטבלה = ה-sectPr הראשון שמסתיים אחריה
    const sec = sections.find((s) => s.end > t.start);
    if (!sec) continue;
    const fixed = fitTable(xml.slice(t.start, t.end), sec.width);
    if (fixed === null) continue;
    out += xml.slice(pos, t.start) + fixed;
    pos = t.end;
    changed = true;
  }
  return changed ? out + xml.slice(pos) : null;
}

/**
 * docx → docx עם word/document.xml מתוקן. מחזיר את הבייטים *המקוריים* (אותו אובייקט) אם אין
 * מה לשנות או אם משהו נכשל - לעולם לא זורק, כדי שתקלה כאן לא תפיל הורדה/תצוגה.
 */
export async function fitTablesToPage(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const entryName = ["word/document.xml", "word" + String.fromCharCode(92) + "document.xml"].find((n) => zip.file(n));
    if (!entryName) return bytes;
    const entry = zip.file(entryName)!;
    const patched = fitTablesToPageXml(await entry.async("string"));
    if (patched === null) return bytes;
    // שימור ה-date המקורי כדי שהבייטים (ומפתח המטמון md5) יהיו יציבים בין בקשות
    zip.file(entryName, patched, { date: entry.date, createFolders: false });
    return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  } catch (e) {
    console.warn("[docx-table-fit] התיקון נכשל, ממירים את המקור:", e instanceof Error ? e.message : e);
    return bytes;
  }
}
