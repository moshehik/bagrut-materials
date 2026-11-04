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

test("a mark that spans several paragraphs (question + options) is replaced as one, text left around it stays", async () => {
  const docx = await makeDocx(["לפני", "2. מהי המליצה שיש להבין?", "א. הרעיון הנרמז.", "ב. הנמשל.", "אחרי"]);
  const quote = "מהי המליצה שיש להבין?\nא. הרעיון הנרמז.\nב. הנ";
  const r = await applyDocxFixes(docx, [{ id: 1, originalText: quote, correctedText: "שאלה חדשה" }]);
  assert.deepEqual(r.applied, [1]);
  const xml = await (await JSZip.loadAsync(r.bytes)).file("word/document.xml")!.async("string");
  const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("|");
  assert.match(text, /לפני/);
  assert.match(text, /2\. /);
  assert.match(text, /שאלה חדשה/);
  assert.match(text, /משל\./); // מה שנשאר אחרי הסימון בפסקה האחרונה
  assert.doesNotMatch(text, /הרעיון הנרמז/);
  assert.match(text, /אחרי/);
  assert.equal((text.match(/שאלה חדשה/g) ?? []).length, 1);
});

test("a multi-paragraph mark whose middle does not match is still reported missing", async () => {
  const docx = await makeDocx(["שאלה אחת כאן", "משהו אחר לגמרי", "סעיף ב"]);
  const r = await applyDocxFixes(docx, [{ id: 1, originalText: "כאן סעיף ב", correctedText: "x" }]);
  assert.deepEqual(r.applied, []);
});

test("resolveQuote: exact, approximate (punctuation/ordering noise) and out-of-order pieces", async () => {
  const { resolveQuote } = await import("../src/lib/docx-fixes");
  const docx = await makeDocx([
    "יחי ראובן ואל ימות",
    "משה מבקש שני דברים עבור ראובן: שיחיה בעולם הזה, ושיזכה גם לעולם הבא.",
    "פסקה אחרת לגמרי על נושא שונה",
  ]);
  const exact = await resolveQuote(docx, "מבקש שני דברים");
  assert.equal(exact?.exact, true);
  // נקודה במקום נקודתיים, וחסרות מילים באמצע
  const noisy = await resolveQuote(docx, "משה מבקש שני דברים עבור ראובן. שיחיה בעולם הזה ושיזכה לעולם הבא");
  assert.equal(noisy?.exact, false);
  assert.match(noisy!.quote, /^משה מבקש שני דברים עבור ראובן: שיחיה בעולם הזה, ושיזכה גם לעולם הבא\.?$/);
  // שני חלקים בסדר הפוך מהקובץ (שכבת טקסט של PDF)
  const swapped = await resolveQuote(docx, "משה מבקש שני דברים עבור ראובן. יחי ראובן ואל ימות");
  assert.ok(swapped);
  assert.match(swapped!.quote, /יחי ראובן/);
  assert.match(swapped!.quote, /עבור ראובן/);
  // טקסט שלא קיים בכלל
  assert.equal(await resolveQuote(docx, "משפט שאין לו שום קשר לקובץ הזה בכלל"), null);
  // התוצאה ניתנת להחלה בדיוק
  const applied = await applyDocxFixes(docx, [{ id: 1, originalText: noisy!.quote, correctedText: "חדש", occurrence: noisy!.occurrence }]);
  assert.deepEqual(applied.applied, [1]);
});
