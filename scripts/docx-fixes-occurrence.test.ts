/**
 * בדיקת בחירת המופע ב-applyDocxFixes (docx סינתטי). הרצה:
 *   npx tsx --conditions=react-server --test scripts/docx-fixes-occurrence.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { applyDocxFixes } from "../src/lib/docx-fixes";

async function makeDocx(paras: string[]): Promise<Uint8Array> {
  const body = paras
    .map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  return await zip.generateAsync({ type: "uint8array" });
}
async function textsOf(bytes: Uint8Array): Promise<string[]> {
  const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((p) => [...p[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(""));
}

test("occurrence: default replaces the first occurrence only", async () => {
  const docx = await makeDocx(["שלום עולם", "שלום עולם", "אחר"]);
  const r = await applyDocxFixes(docx, [{ id: 1, originalText: "שלום", correctedText: "בוקר" }]);
  assert.deepEqual(r.applied, [1]);
  assert.deepEqual(await textsOf(r.bytes), ["בוקר עולם", "שלום עולם", "אחר"]);
});

test("occurrence: 1 replaces the second occurrence", async () => {
  const docx = await makeDocx(["שלום עולם", "שלום עולם", "אחר"]);
  const r = await applyDocxFixes(docx, [{ id: 1, originalText: "שלום", correctedText: "בוקר", occurrence: 1 }]);
  assert.deepEqual(await textsOf(r.bytes), ["שלום עולם", "בוקר עולם", "אחר"]);
});

test("occurrence: counts several matches inside one paragraph, ignoring spaces", async () => {
  const docx = await makeDocx(["אבג אבג אבג"]);
  const r = await applyDocxFixes(docx, [{ id: 1, originalText: "אבגאבג", correctedText: "X", occurrence: 0 }]);
  assert.equal(r.applied.length, 1);
  const r2 = await applyDocxFixes(docx, [{ id: 1, originalText: "אבג", correctedText: "X", occurrence: 2 }]);
  assert.deepEqual(await textsOf(r2.bytes), ["אבג אבג X"]);
});

test("occurrence: fewer occurrences than expected falls back to the first", async () => {
  const docx = await makeDocx(["שלום עולם", "אחר"]);
  const r = await applyDocxFixes(docx, [{ id: 1, originalText: "שלום", correctedText: "בוקר", occurrence: 5 }]);
  assert.deepEqual(await textsOf(r.bytes), ["בוקר עולם", "אחר"]);
});

test("occurrence: missing text is reported", async () => {
  const docx = await makeDocx(["שלום עולם"]);
  const r = await applyDocxFixes(docx, [{ id: 1, originalText: "אין כזה", correctedText: "X", occurrence: 1 }]);
  assert.deepEqual(r.applied, []);
  assert.deepEqual(r.missing, [1]);
});
