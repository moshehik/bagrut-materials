/**
 * בדיקות לתיקון שג'מיני מנסח: פענוח התשובה, הקשר הפסקה מתוך ה-docx, והכנסת התיקון לקובץ בסקריפט. הרצה:
 *   npx tsx --conditions=react-server --test scripts/gemini-fix.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { applyDocxFixes, findParagraphContext } from "../src/lib/docx-fixes";
import { parseGeminiFix } from "../src/lib/gemini-fix-parse";

async function makeDocx(paras: string[]): Promise<Uint8Array> {
  const body = paras.map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  return await zip.generateAsync({ type: "uint8array" });
}

test("parseGeminiFix: plain JSON, fenced JSON, refusal, garbage", () => {
  assert.equal(parseGeminiFix('{"corrected":"שלום"}')?.corrected, "שלום");
  assert.equal(parseGeminiFix('```json\n{"corrected":"בוקר טוב"}\n```')?.corrected, "בוקר טוב");
  assert.deepEqual(parseGeminiFix('{"corrected":"","reason":"לא ברור"}'), { corrected: "", reason: "לא ברור" });
  assert.equal(parseGeminiFix("לא JSON"), null);
  assert.equal(parseGeminiFix('{"other":1}'), null);
});

test("findParagraphContext: paragraph with neighbours, ignoring spaces; occurrence picks the right one", async () => {
  const docx = await makeDocx(["פתיחה", "הניסוח עילג מאוד כאן", "באמצע", "הניסוח עילג מאוד שוב", "סוף"]);
  const first = await findParagraphContext(docx, "עילגמאוד");
  assert.equal(first?.paragraph, "הניסוח עילג מאוד כאן");
  assert.equal(first?.before, "פתיחה");
  assert.equal(first?.after, "באמצע");
  const second = await findParagraphContext(docx, "עילג מאוד", 1);
  assert.equal(second?.paragraph, "הניסוח עילג מאוד שוב");
  assert.equal(await findParagraphContext(docx, "לא קיים בכלל"), null);
});

test("Gemini text is placed into the docx by applyDocxFixes (not by Gemini)", async () => {
  const docx = await makeDocx(["הניסוח עילג מאוד כאן"]);
  const ctx = await findParagraphContext(docx, "עילג מאוד");
  assert.ok(ctx);
  const gemini = parseGeminiFix('{"corrected":"בלתי ברור"}')!;
  const r = await applyDocxFixes(docx, [{ id: 1, originalText: "עילג מאוד", correctedText: gemini.corrected }]);
  assert.deepEqual(r.applied, [1]);
  const xml = await (await JSZip.loadAsync(r.bytes)).file("word/document.xml")!.async("string");
  assert.match(xml, /בלתי ברור/);
  assert.doesNotMatch(xml, /עילג מאוד/);
});
