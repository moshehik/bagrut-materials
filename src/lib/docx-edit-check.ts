/**
 * בדיקות טהורות של docx שהסוכן ערך ביד (לא "תיקון מסומן" של החלפת טקסט): משווה את הקובץ הערוך למקור ומחזיר
 * שגיאות (חוסמות) ואזהרות. משמש את scripts/agent-general-fix.ts (--check / --private / --merge) לפני כל העלאה.
 * הכללים: "כללי עריכת קבצי וורד מבוקשים באתר.md" + CLAUDE.md (קווי השלמה = תווי קו תחתון; לא ליישר left/right
 * בפסקת bidi; styles/fonts/header/footer לא נוגעים). בלי "server-only" – רץ גם כסקריפט. נבדק ב-scripts/docx-edit-check.test.ts.
 */
import JSZip from "jszip";

export type EditCheckResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    paragraphsBefore: number;
    paragraphsAfter: number;
    charsBefore: number;
    charsAfter: number;
    changedEntries: string[];
  };
};

/** חלקים שמותר לסוכן לשנות בעריכה כללית (התוכן בלבד – לא עיצוב/גופנים/כותרות עליונות ותחתונות) */
const EDITABLE_ENTRIES = new Set(["word/document.xml"]);

function norm(name: string) {
  return name.split("\\").join("/");
}

async function entries(zip: JSZip): Promise<Map<string, JSZip.JSZipObject>> {
  const out = new Map<string, JSZip.JSZipObject>();
  for (const [n, f] of Object.entries(zip.files)) if (!f.dir) out.set(norm(n), f);
  return out;
}

export function plainText(xml: string): string {
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)]
    .map((m) => m[1])
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/** פסקאות bidi שבהן יש יישור left/right – הבאג שהופך את היישור בעברית (אסור להוסיף כאלה) */
export function bidiMisalignedCount(xml: string): number {
  let n = 0;
  for (const p of xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/g) ?? []) {
    if (/<w:bidi\b/.test(p) && /<w:jc w:val="(left|right)"/.test(p)) n++;
  }
  return n;
}

/** ריצות שמורכבות מרווחים בלבד עם קו תחתון – "קו השלמה" שנעלם ב-PDF בשבירת שורה (CLAUDE.md: להשתמש ב-____) */
export function underlinedSpaceRuns(xml: string): number {
  let n = 0;
  for (const r of xml.match(/<w:r\b[\s\S]*?<\/w:r>/g) ?? []) {
    if (/<w:u\b/.test(r) && /<w:t(?: [^>]*)?> {3,}<\/w:t>/.test(r)) n++;
  }
  return n;
}

/**
 * משווה docx ערוך למקור. שגיאה (ok=false) כשנגעו בחלק שאסור לגעת בו, כשה-XML לא מאוזן, כשהתוכן נעלם/התנפח מעבר לסביר,
 * או כשנוספו יישורי left/right בפסקאות bidi. אזהרה כשנוספו "קווי השלמה" מרווחים-עם-קו-תחתון או כשמספר הפסקאות השתנה
 * מאוד (הסוכן צריך לוודא שזה מכוון).
 */
export async function checkEditedDocx(before: Uint8Array | Buffer, after: Uint8Array | Buffer): Promise<EditCheckResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = { paragraphsBefore: 0, paragraphsAfter: 0, charsBefore: 0, charsAfter: 0, changedEntries: [] as string[] };
  const fail = (): EditCheckResult => ({ ok: false, errors, warnings, stats });

  if (after.length < 2000) {
    errors.push(`הקובץ הערוך קטן מדי (${after.length} בתים)`);
    return fail();
  }
  let a: JSZip, b: JSZip;
  try {
    [a, b] = await Promise.all([JSZip.loadAsync(before), JSZip.loadAsync(after)]);
  } catch (e) {
    errors.push(`לא ניתן לפתוח את ה-docx כ-zip: ${e instanceof Error ? e.message : e}`);
    return fail();
  }
  const [ea, eb] = await Promise.all([entries(a), entries(b)]);
  const docA = ea.get("word/document.xml");
  const docB = eb.get("word/document.xml");
  if (!docA || !docB) {
    errors.push("חסר word/document.xml");
    return fail();
  }
  const namesA = [...ea.keys()].sort();
  const namesB = [...eb.keys()].sort();
  const missing = namesA.filter((n) => !eb.has(n));
  const added = namesB.filter((n) => !ea.has(n));
  if (missing.length) errors.push(`חלקים נמחקו מה-docx: ${missing.join(", ")}`);
  if (added.length) errors.push(`חלקים נוספו ל-docx: ${added.join(", ")}`);

  for (const n of namesA) {
    if (!eb.has(n)) continue;
    const [x, y] = await Promise.all([ea.get(n)!.async("uint8array"), eb.get(n)!.async("uint8array")]);
    const same = x.length === y.length && Buffer.compare(Buffer.from(x), Buffer.from(y)) === 0;
    if (same) continue;
    stats.changedEntries.push(n);
    if (!EDITABLE_ENTRIES.has(n)) errors.push(`${n} השתנה – מותר לערוך רק word/document.xml (עיצוב/גופנים/כותרות נשארים זהים)`);
  }

  const [xa, xb] = await Promise.all([docA.async("string"), docB.async("string")]);
  stats.paragraphsBefore = count(xa, /<w:p[ >]/g);
  stats.paragraphsAfter = count(xb, /<w:p[ >]/g);
  const ta = plainText(xa);
  const tb = plainText(xb);
  stats.charsBefore = ta.replace(/\s+/g, "").length;
  stats.charsAfter = tb.replace(/\s+/g, "").length;

  // איזון XML בסיסי – פסקאות/ריצות/טקסט (עורך שעבד עם regex שבור משאיר תגים פתוחים)
  const pairs: [RegExp, RegExp, string][] = [
    [/<w:p[ >]/g, /<\/w:p>/g, "w:p"],
    [/<w:r[ >]/g, /<\/w:r>/g, "w:r"],
    [/<w:t[ >]/g, /<\/w:t>/g, "w:t"],
    [/<w:tbl[ >]/g, /<\/w:tbl>/g, "w:tbl"],
    [/<w:tr[ >]/g, /<\/w:tr>/g, "w:tr"],
    [/<w:tc[ >]/g, /<\/w:tc>/g, "w:tc"],
  ];
  for (const [open, close, tag] of pairs) {
    const o = count(xb, open);
    const c = count(xb, close);
    if (o !== c) errors.push(`XML לא מאוזן: ${o} פתיחות <${tag}> מול ${c} סגירות`);
  }
  if (!/<w:body>[\s\S]*<\/w:body>\s*<\/w:document>\s*$/.test(xb)) errors.push("document.xml לא מסתיים ב-</w:body></w:document>");
  if (count(xa, /<w:sectPr\b/g) !== count(xb, /<w:sectPr\b/g)) errors.push("מספר ה-sectPr (הגדרות עמוד) השתנה");
  // תו בקרה אסור ב-XML (למשל \u0000 או תווי C0 מלבד tab/lf/cr) – שובר את LibreOffice
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xb)) errors.push("document.xml מכיל תווי בקרה לא חוקיים");
  if (/<w:t(?: [^>]*)?>[^<]*&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)[^<]*<\/w:t>/.test(xb)) errors.push("טקסט עם & לא מקודד (צריך &amp;)");

  if (stats.charsAfter < stats.charsBefore * 0.3) errors.push(`התוכן התכווץ ל-${stats.charsAfter} תווים מתוך ${stats.charsBefore} – יותר מדי נמחק`);
  if (stats.charsAfter > stats.charsBefore * 3 + 500) errors.push(`התוכן התנפח ל-${stats.charsAfter} תווים מתוך ${stats.charsBefore} – לא נראה כתיקון`);

  const misA = bidiMisalignedCount(xa);
  const misB = bidiMisalignedCount(xb);
  if (misB > misA) errors.push(`נוספו ${misB - misA} פסקאות bidi עם יישור left/right (הופך את היישור בעברית)`);

  const ulA = underlinedSpaceRuns(xa);
  const ulB = underlinedSpaceRuns(xb);
  if (ulB > ulA) warnings.push(`נוספו ${ulB - ulA} "קווי השלמה" מרווחים עם קו תחתון – נעלמים ב-PDF בשבירת שורה; להשתמש בתווי ____`);
  if (stats.paragraphsAfter !== stats.paragraphsBefore) {
    warnings.push(`מספר הפסקאות השתנה: ${stats.paragraphsBefore} → ${stats.paragraphsAfter} (מותר בשינוי מבנה – לוודא שזה מכוון)`);
  }
  if (ta === tb && stats.changedEntries.length === 0) warnings.push("הקובץ הערוך זהה למקור – אין מה לפרסם");
  if (/שלא ככתוב|אינטרנט|וואטסאפ|סמארטפון|טלפון חכם/.test(tb) && !/אינטרנט|וואטסאפ|סמארטפון|טלפון חכם/.test(ta)) {
    warnings.push("נוסף אזכור אינטרנט/מדיה – נוגד את כללי החומרים");
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}

/** שורות הטקסט ששונו (לפי פסקאות שטוחות) – לתצוגה בפלט הסקריפט, לא לאימות */
export function paragraphDiff(xmlBefore: string, xmlAfter: string, limit = 40): { removed: string[]; added: string[] } {
  const paras = (xml: string) =>
    (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => plainText(p).trim()).filter(Boolean);
  const pa = paras(xmlBefore);
  const pb = paras(xmlAfter);
  const setA = new Set(pa);
  const setB = new Set(pb);
  return { removed: pa.filter((t) => !setB.has(t)).slice(0, limit), added: pb.filter((t) => !setA.has(t)).slice(0, limit) };
}
