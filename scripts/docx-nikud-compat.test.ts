/**
 * בדיקות להחלפת ניקוד בזמן-הגשה (docx-nikud-compat). הרצה:
 *   npx tsx --test scripts/docx-nikud-compat.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { normalizeNikudCompat, normalizeNikudCompatXml } from "../src/lib/docx-nikud-compat";

const QQ = "ׇ"; // קמץ קטן
const HH = "ֺ"; // חולם חסר לו"ו

function docXml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

async function makeDocx(body: string, entry = "word/document.xml"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(entry, docXml(body), { date: new Date("2026-01-01T00:00:00Z"), createFolders: false });
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`, { date: new Date("2026-01-01T00:00:00Z") });
  return await zip.generateAsync({ type: "uint8array" });
}

test("xml: קמץ קטן → קמץ, חולם חסר → חולם, רק בתוך w:t", () => {
  const xml = docXml(`<w:p><w:r><w:t xml:space="preserve">וַתָּע${QQ}ז מִצְו${HH}ת</w:t></w:r></w:p>`);
  const out = normalizeNikudCompatXml(xml);
  assert.ok(out);
  assert.equal(out, xml.replace(QQ, "ָ").replace(HH, "ֹ"));
  assert.ok(!out.includes(QQ) && !out.includes(HH));
});

test("xml: בלי הסימנים - מחזיר null (אין שינוי בבייטים/במפתח המטמון)", () => {
  assert.equal(normalizeNikudCompatXml(docXml(`<w:p><w:r><w:t>כָּל־זֹאת בְּעָפְרָה</w:t></w:r></w:p>`)), null);
});

test("xml: לא נוגעים בטקסט שאינו w:t (instrText / מאפיינים)", () => {
  const xml = docXml(`<w:p><w:r><w:instrText>x${QQ}</w:instrText><w:t>a</w:t></w:r></w:p>`);
  assert.equal(normalizeNikudCompatXml(xml), null);
});

test("docx: ההחלפה מתבצעת, שאר הרשומות נשמרות, ובייטים יציבים בין הרצות", async () => {
  const docx = await makeDocx(`<w:p><w:r><w:t>כ${QQ}ל־אִישׁ</w:t></w:r></w:p>`);
  const a = await normalizeNikudCompat(docx);
  const b = await normalizeNikudCompat(docx);
  assert.notEqual(a, docx);
  assert.deepEqual(Buffer.from(a), Buffer.from(b)); // אותו md5 בכל בקשה
  const zip = await JSZip.loadAsync(a);
  assert.deepEqual(Object.keys(zip.files).sort(), ["[Content_Types].xml", "word/document.xml"]);
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.ok(xml.includes("כָל־אִישׁ") && !xml.includes(QQ));
  // קובץ שאין בו מה לתקן חוזר כאותו אובייקט
  const clean = await makeDocx(`<w:p><w:r><w:t>שָׁלוֹם</w:t></w:r></w:p>`);
  assert.equal(await normalizeNikudCompat(clean), clean);
});

test("docx: נתיב עם backslash (קבצים שנבנו בסקריפט)", async () => {
  const docx = await makeDocx(`<w:p><w:r><w:t>ע${QQ}תְנִיאֵל</w:t></w:r></w:p>`, "word\\document.xml");
  const out = await normalizeNikudCompat(docx);
  assert.notEqual(out, docx);
  const xml = await (await JSZip.loadAsync(out)).file("word\\document.xml")!.async("string");
  assert.ok(xml.includes("עָתְנִיאֵל"));
});

test("docx: קלט שאינו zip - מחזיר את המקור בלי לזרוק", async () => {
  const junk = new Uint8Array([1, 2, 3]);
  assert.equal(await normalizeNikudCompat(junk), junk);
});
