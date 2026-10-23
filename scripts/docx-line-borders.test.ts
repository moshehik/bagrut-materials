/**
 * בדיקות להפרדת שורות כתיבה סמוכות בזמן-הגשה (docx-line-borders). הרצה:
 *   npx tsx --test scripts/docx-line-borders.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { separateLineBorders, separateLineBordersXml } from "../src/lib/docx-line-borders";

const doc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
const line = (space = 6, color = "999999") =>
  `<w:p><w:pPr><w:bidi/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="${space}" w:color="${color}"/></w:pBdr></w:pPr></w:p>`;
const text = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const colors = (xml: string) => [...xml.matchAll(/w:color="([0-9A-F]{6})"/gi)].map((m) => m[1]);

test("שורות סמוכות זהות: הצבע מתחלף, אין שתי סמוכות זהות", () => {
  const out = separateLineBordersXml(doc(line() + line() + line() + line() + line()))!;
  assert.deepEqual(colors(out), ["999999", "999998", "999999", "999998", "999999"]);
});

test("גם כש-w:space כבר מתחלף (התיקון הישן) - עדיין מפרידים לפי צבע", () => {
  const out = separateLineBordersXml(doc(line(6) + line(7)))!;
  assert.deepEqual(colors(out), ["999999", "999998"]);
});

test("שתי קבוצות שמופרדות בטקסט: כל קבוצה מתחילה מחדש", () => {
  const out = separateLineBordersXml(doc(line() + line() + text("שאלה 2") + line() + line()))!;
  assert.deepEqual(colors(out), ["999999", "999998", "999999", "999998"]);
});

test("שורה בודדת - לא נוגעים (null)", () => {
  assert.equal(separateLineBordersXml(doc(text("שאלה") + line() + text("עוד"))), null);
});

test("מסגרת ציטוט (פסקאות עם טקסט וגבולות נוספים) - לא נוגעים", () => {
  const box = (t: string) =>
    `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="1" w:color="999999"/></w:pBdr></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
  assert.equal(separateLineBordersXml(doc(box("א") + box("ב"))), null);
});

test("פסקה ריקה עם גבולות נוספים (top/left) - לא נוגעים", () => {
  const framed = `<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="4" w:space="1" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>`;
  assert.equal(separateLineBordersXml(doc(framed + framed)), null);
});

test("צבע auto (דף לתלמידה): כל פסקה שנייה הופכת ל-000001, גם כש-w:space מתחלף", () => {
  const out = separateLineBordersXml(doc(line(6, "auto") + line(7, "auto") + line(6, "auto") + line(7, "auto")))!;
  assert.deepEqual([...out.matchAll(/w:color="([A-Za-z0-9]+)"/g)].map((m) => m[1]), ["auto", "000001", "auto", "000001"]);
});

test("docx: בייטים מתוקנים ויציבים; קובץ בלי מה לתקן חוזר כאותו אובייקט", async () => {
  const mk = async (body: string) => {
    const zip = new JSZip();
    zip.file("word/document.xml", doc(body), { date: new Date("2026-01-01T00:00:00Z"), createFolders: false });
    return await zip.generateAsync({ type: "uint8array" });
  };
  const bad = await mk(line() + line());
  const a = await separateLineBorders(bad);
  assert.notEqual(a, bad);
  assert.deepEqual(a, await separateLineBorders(bad));
  const ok = await mk(text("x"));
  assert.equal(await separateLineBorders(ok), ok);
});
