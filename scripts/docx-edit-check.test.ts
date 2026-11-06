/**
 * בדיקות של src/lib/docx-edit-check.ts (אימות docx שהסוכן ערך ביד, לפני פרסום כגרסה פרטית/משותפת). הרצה:
 *   npx tsx --test scripts/docx-edit-check.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { bidiMisalignedCount, checkEditedDocx, paragraphDiff, plainText, underlinedSpaceRuns } from "../src/lib/docx-edit-check";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const PAD = "x".repeat(2500); // כדי שהקובץ יעבור את סף 2000 הבתים

function docXml(paras: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${paras.join("")}<w:sectPr/></w:body></w:document>`;
}
const p = (text: string, pPr = "") => `<w:p>${pPr}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** paras: טקסט פשוט (נעטף בפסקה) או XML של פסקה מוכנה (מתחיל ב-<w:p>) */
async function makeDocx(paras: string[], extra: Record<string, string> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", docXml(paras.map((x) => (x.startsWith("<w:p") ? x : p(x)))));
  zip.file("word/styles.xml", `<w:styles ${W}><!-- ${PAD} --></w:styles>`);
  zip.file("word/header1.xml", `<w:hdr ${W}><w:p><w:r><w:t>בס"ד</w:t></w:r></w:p></w:hdr>`);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);
  for (const [k, v] of Object.entries(extra)) zip.file(k, v);
  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}

const base = ["שאלה 1: מה אמר משה?", "תשובה: ____________", "שאלה 2: מה ענה אהרן?", "תשובה: ____________"];

test("identical edit: ok with a warning that nothing changed", async () => {
  const a = await makeDocx(base);
  const r = await checkEditedDocx(a, a);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("זהה")));
  assert.deepEqual(r.stats.changedEntries, []);
});

test("content edit in document.xml only passes; paragraph count change is a warning", async () => {
  const a = await makeDocx(base);
  const b = await makeDocx([...base, "שאלה 3: מה קרה בסוף?", "תשובה: ____________"]);
  const r = await checkEditedDocx(a, b);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.deepEqual(r.stats.changedEntries, ["word/document.xml"]);
  assert.equal(r.stats.paragraphsAfter, r.stats.paragraphsBefore + 2);
  assert.ok(r.warnings.some((w) => w.includes("מספר הפסקאות")));
});

test("touching styles.xml or header is an error", async () => {
  const a = await makeDocx(base);
  const b = await makeDocx(base, { "word/styles.xml": `<w:styles ${W}><!-- ${PAD} changed --></w:styles>` });
  const r = await checkEditedDocx(a, b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("word/styles.xml")));
});

test("removed or added zip entries are errors", async () => {
  const a = await makeDocx(base);
  const added = await makeDocx(base, { "word/footer1.xml": `<w:ftr ${W}/>` });
  const r1 = await checkEditedDocx(a, added);
  assert.ok(r1.errors.some((e) => e.includes("נוספו")));
  const r2 = await checkEditedDocx(added, a);
  assert.ok(r2.errors.some((e) => e.includes("נמחקו")));
});

test("deleting most of the content is an error", async () => {
  const long = Array.from({ length: 20 }, (_, i) => `פסקה ארוכה מספר ${i} עם הרבה מילים כדי שיהיה תוכן`);
  const a = await makeDocx(long);
  const b = await makeDocx(long.slice(0, 2));
  const r = await checkEditedDocx(a, b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("התכווץ")));
});

test("unbalanced XML is an error", async () => {
  const a = await makeDocx(base);
  const zip = await JSZip.loadAsync(a);
  const xml = (await zip.file("word/document.xml")!.async("string")).replace("</w:p><w:sectPr/>", "<w:sectPr/>");
  zip.file("word/document.xml", xml);
  const b = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  const r = await checkEditedDocx(a, b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("לא מאוזן")));
});

test("adding jc left/right inside a bidi paragraph is an error; existing ones are tolerated", async () => {
  const bidiOk = '<w:pPr><w:bidi/><w:jc w:val="both"/></w:pPr>';
  const bidiBad = '<w:pPr><w:bidi/><w:jc w:val="left"/></w:pPr>';
  const a = await makeDocx([p("א", bidiOk), p("ב", bidiBad)]);
  const b = await makeDocx([p("א", bidiBad), p("ב", bidiBad)]);
  assert.equal(bidiMisalignedCount(docXml([p("א", bidiBad)])), 1);
  const r = await checkEditedDocx(a, b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("left/right")));
  const same = await checkEditedDocx(a, await makeDocx([p("א", bidiOk), p("ב שונה", bidiBad)]));
  assert.equal(same.ok, true, same.errors.join("; "));
});

test("underlined-space fill lines are a warning, underscores are not", async () => {
  const a = await makeDocx(base);
  const ulRun = `<w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">          </w:t></w:r></w:p>`;
  const b = await makeDocx([...base, ulRun]);
  assert.equal(underlinedSpaceRuns(ulRun), 1);
  const r = await checkEditedDocx(a, b);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.ok(r.warnings.some((w) => w.includes("קווי השלמה")));
  const c = await makeDocx([...base, "תשובה: ________"]);
  const r2 = await checkEditedDocx(a, c);
  assert.ok(!r2.warnings.some((w) => w.includes("קווי השלמה")));
});

test("plainText decodes entities; paragraphDiff lists removed/added paragraphs", () => {
  assert.equal(plainText('<w:t xml:space="preserve">א &amp; ב</w:t><w:t>ג</w:t>'), "א & בג");
  const d = paragraphDiff(docXml([p("ישן"), p("נשאר")]), docXml([p("נשאר"), p("חדש")]));
  assert.deepEqual(d, { removed: ["ישן"], added: ["חדש"] });
});

test("tiny file is rejected", async () => {
  const a = await makeDocx(base);
  const r = await checkEditedDocx(a, new Uint8Array(10));
  assert.equal(r.ok, false);
});
