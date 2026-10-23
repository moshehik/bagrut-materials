/**
 * תיקון בזמן-הגשה: לוגו הכותרת (ציור צף) שנחתך על ידי גוף הדף, לפני ההמרה ל-PDF (לצד docx-blank-lines.ts).
 *
 * הבעיה (אומתה 2026-10-23, "דף העשרה - פרק טו" של בשלח): הלוגו בכותרת העליונה הוא `wp:anchor` צף (wrapNone)
 * שבולט ~1.2 ס"מ מתחת לשורת "בס"ד / שם הפרשה". בקבצים שהשוליים העליונים שלהם קטנים (720 twips = 1.27 ס"מ, כמו
 * בדפי ההעשרה) גוף הדף מתחיל *מעל* תחתית הלוגו - פס הכותרת הצבעוני של הפסקה הראשונה מצויר על הלוגו וחותך אותו.
 * בבחנים (שוליים 1440) יש מספיק רווח ולכן אין בעיה. ציור צף לא דוחף את הגוף, ולכן אין "רווח אוטומטי".
 *
 * הפתרון: לכל מקטע, מחשבים כמה מתחת לתחילת הכותרת הלוגו מגיע (מרחק הכותרת + הסטת הציור + גובהו) ומגדילים את
 * `w:pgMar/@w:top` אם הוא קטן מזה (+ מרווח קטן). שוליים שכבר מספיקים לא משתנים. הקובץ בדרייב לא משתנה. כמו
 * docx-blank-lines: חייב לרוץ *לפני* חישוב מפתח מטמון ה-PDF (md5), ר' prepareOfficeForConvert ב-driveBridgeCore.ts.
 * בלי "server-only" בכוונה - סקריפטים עצמאיים מייבאים את driveBridgeCore.
 */

import JSZip from "jszip";

/** מרווח ביטחון (twips) בין תחתית הלוגו לתחילת הגוף */
const GAP_TWIPS = 40;
/** EMU לטוויפ */
const EMU_PER_TWIP = 635;

/** כמה twips מתחת לתחילת פסקת הכותרת מגיעים ציורים צפים בלי עטיפה בכותרת (0 אם אין) */
export function headerOverhangTwips(headerXml: string): number {
  let max = 0;
  for (const m of headerXml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)) {
    const a = m[0];
    if (!/<wp:wrapNone\s*\/>/.test(a)) continue;
    const posV = a.match(/<wp:positionV\s+relativeFrom="(\w+)"[^>]*>\s*<wp:posOffset>(-?\d+)<\/wp:posOffset>/);
    if (!posV || posV[1] !== "paragraph") continue;
    const cy = Number(a.match(/<wp:extent\s[^>]*cy="(\d+)"/)?.[1]);
    if (!(cy > 0)) continue;
    max = Math.max(max, Math.round((Number(posV[2]) + cy) / EMU_PER_TWIP));
  }
  return max;
}

/** השוליים העליונים המינימליים שנדרשים (twips), או 0 אם אין לוגו צף */
export function requiredTopMargin(headerDist: number, overhang: number): number {
  return overhang > 0 ? headerDist + overhang + GAP_TWIPS : 0;
}

const SECT_PR = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/g;

/**
 * הליבה: מקבל את document.xml, את מפת rId→XML של הכותרות, ומחזיר document.xml מתוקן (או null אם אין מה לשנות).
 * טהור וסינכרוני - נוח לבדיקות.
 */
export function clearHeaderLogoXml(docXml: string, headersByRid: Map<string, string>): string | null {
  let changed = false;
  const out = docXml.replace(SECT_PR, (sect) => {
    const rid = sect.match(/<w:headerReference\s+[^>]*w:type="default"[^>]*r:id="([^"]+)"/)?.[1]
      ?? sect.match(/<w:headerReference\s+[^>]*r:id="([^"]+)"[^>]*w:type="default"/)?.[1];
    const header = rid ? headersByRid.get(rid) : undefined;
    if (!header) return sect;
    const overhang = headerOverhangTwips(header);
    if (!overhang) return sect;
    const mar = sect.match(/<w:pgMar\b[^>]*>/);
    if (!mar) return sect;
    const top = Number(mar[0].match(/w:top="(-?\d+)"/)?.[1]);
    const headerDist = Number(mar[0].match(/w:header="(\d+)"/)?.[1] ?? 708);
    const need = requiredTopMargin(headerDist, overhang);
    if (!(top >= 0) || top >= need) return sect;
    changed = true;
    return sect.replace(mar[0], mar[0].replace(/w:top="-?\d+"/, `w:top="${need}"`));
  });
  return changed ? out : null;
}

export async function clearHeaderLogo(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const entryName = ["word/document.xml", "word" + String.fromCharCode(92) + "document.xml"].find((n) => zip.file(n));
    const relsEntry = zip.file("word/_rels/document.xml.rels");
    if (!entryName || !relsEntry) return bytes;
    const rels = await relsEntry.async("string");
    const headersByRid = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const tag = m[0];
      if (!/relationships\/header"/.test(tag)) continue;
      const id = tag.match(/\bId="([^"]+)"/)?.[1];
      const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
      if (!id || !target) continue;
      const part = zip.file(target.startsWith("/") ? target.slice(1) : `word/${target}`);
      if (part) headersByRid.set(id, await part.async("string"));
    }
    if (headersByRid.size === 0) return bytes;
    const entry = zip.file(entryName)!;
    const patched = clearHeaderLogoXml(await entry.async("string"), headersByRid);
    if (patched === null) return bytes;
    // שימור ה-date המקורי כדי שהבייטים (ומפתח המטמון md5) יהיו יציבים בין בקשות
    zip.file(entryName, patched, { date: entry.date, createFolders: false });
    return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  } catch (e) {
    console.warn("[docx-header-clearance] התיקון נכשל, ממירים את המקור:", e instanceof Error ? e.message : e);
    return bytes;
  }
}
