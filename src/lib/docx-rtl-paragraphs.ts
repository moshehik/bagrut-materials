/**
 * תיקון בזמן-הגשה: פסקאות עבריות בלי כיוון ימין-לשמאל, לפני ההמרה ל-PDF (לצד docx-blank-lines.ts).
 *
 * הבעיה (אומתה 2026-11-05, "סיכום להכתבה - פרק א" של משלי ו"דף העשרה - פרק א"): הקבצים שנבנו ללא `<w:bidi/>` ברמת
 * המקטע (sectPr) ובלי `<w:bidi/>` בפסקאות הם פסקאות LTR עם טקסט עברי. התוצאה ב-LibreOffice (ובוורד):
 *  - פסקה מיושרת-לשני-הצדדים (`jc both`) - השורה האחרונה שלה נצמדת לשמאל במקום לימין;
 *  - כותרת העליונה ("בס"ד" ‹טאב› שם הפרשה/הספר) - "בס"ד" נצמד לשמאל, בדיוק איפה שלוגו הכותרת (מיושר לשמאל), והטקסט
 *    נכתב על הלוגו. בקבצים התקינים (עם bidi במקטע) "בס"ד" מימין, השם באמצע והלוגו משמאל.
 * בנוסף (אומת באותו יום): פסקת הכותרת מפנה לסגנון "header" (pStyle="a3") שחסר ב-styles.xml של הקבצים האלה. בלי הסגנון
 * LibreOffice מתעלם מעצירת הטאב באמצע (גם כשהיא מוגדרת ישירות בפסקה): הטאב נהיה רווח של 12pt, "בס"ד" ושם הספר נדבקים
 * זה לזה בצד שמאל ומתחת ללוגו. מוסיפים את הסגנון החסר (עצירות טאב 4153/8306 כמו בקבצים התקינים) - ואז "בס"ד" מימין,
 * השם באמצע והלוגו משמאל.
 * הפתרון: מוסיפים `<w:bidi/>` לפסקאות שהטקסט שלהן עברי ואין להן כיוון (בכותרות העליונות וגם בגוף), רק במסמכים שבהם לא כל
 * המקטעים הם bidi. לא נוגעים בפסקה עם הזחה/מספור/טאבים בגוף (המשמעות שלהם מתהפכת בפסקת bidi), או עם יישור
 * מפורש left/right. הקובץ בדרייב לא משתנה. כמו docx-blank-lines: חייב לרוץ *לפני* חישוב מפתח מטמון ה-PDF (md5),
 * ר' prepareOfficeForConvert ב-driveBridgeCore.ts. בלי "server-only" בכוונה - סקריפטים עצמאיים מייבאים את driveBridgeCore.
 */

import JSZip from "jszip";

const PARAGRAPH = /<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g;
/** אלמנטים שאחריהם (לפי סכמת Word) אסור ש-w:bidi יופיע בתוך pPr - מכניסים לפני הראשון מהם */
const AFTER_BIDI = /<w:(adjustRightInd|snapToGrid|spacing|ind|contextualSpacing|mirrorIndents|suppressOverlap|jc|textDirection|textAlignment|textboxTightWrap|outlineLvl|divId|cnfStyle|rPr|sectPr|pPrChange)\b/;

const HEBREW = /[א-ת]/g;
const LATIN = /[A-Za-z]/g;

function paragraphText(p: string): string {
  return [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
}

/** מוסיף bidi לפסקה אם צריך; מחזיר את הפסקה (אותה מחרוזת אם אין שינוי) */
export function rtlParagraph(p: string, inHeader: boolean): string {
  const open = /^<w:p(?=[\s>])[^>]*>/.exec(p)![0];
  const pPr = /^<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p.slice(open.length));
  // pPr שנגמר ב-</w:pPr> הראשון: ב-pPr יש rPr/sectPr מקוננים, אבל אף אחד מהם לא מכיל pPr משלו
  const ppr = pPr ? pPr[0] : "";
  if (/<w:bidi\b/.test(ppr)) return p;
  const text = paragraphText(p);
  const he = (text.match(HEBREW) ?? []).length;
  if (he === 0 || he < (text.match(LATIN) ?? []).length) return p;
  if (!inHeader && /<w:(ind|numPr|tabs)\b/.test(ppr)) return p;
  const jc = ppr.match(/<w:jc\s+w:val="(\w+)"/)?.[1];
  if (jc === "left" || jc === "right" || jc === "start" || jc === "end") return p;

  if (!pPr) return open + "<w:pPr><w:bidi/></w:pPr>" + p.slice(open.length);
  const at = ppr.search(AFTER_BIDI);
  const newPpr = at >= 0 ? ppr.slice(0, at) + "<w:bidi/>" + ppr.slice(at) : ppr.replace(/<\/w:pPr>$/, "<w:bidi/></w:pPr>");
  return open + newPpr + p.slice(open.length + ppr.length);
}

/** הליבה: XML של document או header → XML מתוקן, או null אם אין מה לשנות. טהור וסינכרוני. */
export function forceRtlParagraphsXml(xml: string, inHeader: boolean): string | null {
  let changed = false;
  const out = xml.replace(PARAGRAPH, (p) => {
    const r = rtlParagraph(p, inHeader);
    if (r !== p) changed = true;
    return r;
  });
  return changed ? out : null;
}

/** סגנון כותרת עליונה בסיסי בשם (id) שחסר במסמך - עצירות טאב אמצע/ימין כמו הסגנון "header" של וורד */
function headerStyleXml(id: string, baseId: string | null): string {
  return (
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="header"/>` +
    (baseId ? `<w:basedOn w:val="${baseId}"/>` : "") +
    `<w:pPr><w:tabs><w:tab w:val="center" w:pos="4153"/><w:tab w:val="right" w:pos="8306"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>`
  );
}

/** מחזיר styles.xml עם הסגנון החסר שהכותרות מפנות אליו (רק "a3"), או null אם אין מה להוסיף */
export function addMissingHeaderStyle(stylesXml: string, headerXmls: string[]): string | null {
  const wanted = new Set<string>();
  for (const h of headerXmls) for (const m of h.matchAll(/<w:pStyle\s+w:val="([^"]+)"/g)) if (m[1] === "a3") wanted.add(m[1]);
  const missing = [...wanted].filter((id) => !new RegExp(`w:styleId="${id}"`).test(stylesXml));
  if (missing.length === 0 || !stylesXml.includes("</w:styles>")) return null;
  const base =
    stylesXml.match(/<w:style\b[^>]*w:type="paragraph"[^>]*w:default="1"[^>]*w:styleId="([^"]+)"/)?.[1] ??
    stylesXml.match(/<w:style\b[^>]*w:default="1"[^>]*w:styleId="([^"]+)"/)?.[1] ??
    null;
  return stylesXml.replace("</w:styles>", () => missing.map((id) => headerStyleXml(id, base)).join("") + "</w:styles>");
}

/** true אם יש מקטע שאינו bidi (או שאין מקטע בכלל) - רק אז מטפלים במסמך */
export function hasNonBidiSection(documentXml: string): boolean {
  const sects = documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) ?? [];
  return sects.length === 0 || sects.some((s) => !/<w:bidi\s*\/>/.test(s));
}

export async function ensureRtlParagraphs(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const docName = ["word/document.xml", "word" + String.fromCharCode(92) + "document.xml"].find((n) => zip.file(n));
    if (!docName) return bytes;
    const docEntry = zip.file(docName)!;
    const docXml = await docEntry.async("string");
    if (!hasNonBidiSection(docXml)) return bytes;

    let any = false;
    const patchedDoc = forceRtlParagraphsXml(docXml, false);
    if (patchedDoc !== null) {
      zip.file(docName, patchedDoc, { date: docEntry.date, createFolders: false });
      any = true;
    }
    const headerXmls: string[] = [];
    for (const name of Object.keys(zip.files)) {
      if (!/^word[\\/]header\d*\.xml$/.test(name)) continue;
      const entry = zip.file(name)!;
      const xml = await entry.async("string");
      headerXmls.push(xml);
      const patched = forceRtlParagraphsXml(xml, true);
      if (patched !== null) {
        zip.file(name, patched, { date: entry.date, createFolders: false });
        any = true;
      }
    }
    const stylesEntry = zip.file("word/styles.xml");
    if (stylesEntry) {
      const patchedStyles = addMissingHeaderStyle(await stylesEntry.async("string"), headerXmls);
      if (patchedStyles !== null) {
        zip.file("word/styles.xml", patchedStyles, { date: stylesEntry.date, createFolders: false });
        any = true;
      }
    }
    if (!any) return bytes;
    return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  } catch (e) {
    console.warn("[docx-rtl-paragraphs] התיקון נכשל, ממירים את המקור:", e instanceof Error ? e.message : e);
    return bytes;
  }
}
