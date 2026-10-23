/**
 * בדיקות לכיווץ טבלאות בזמן-הגשה (docx-table-fit). הרצה:
 *   npx tsx --test scripts/docx-table-fit.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { fitTablesToPage, fitTablesToPageXml } from "../src/lib/docx-table-fit";

const SECT = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;

function docXml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${SECT}</w:body></w:document>`;
}

function table(opts: { tblW?: string; ind?: number; cols: number[]; inner?: string }) {
  const cell = (w: number) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${opts.inner ?? "<w:p/>"}</w:tc>`;
  return (
    `<w:tbl><w:tblPr>${opts.tblW ?? ""}${opts.ind !== undefined ? `<w:tblInd w:w="${opts.ind}" w:type="dxa"/>` : ""}<w:bidiVisual/></w:tblPr>` +
    `<w:tblGrid>${opts.cols.map((c) => `<w:gridCol w:w="${c}"/>`).join("")}</w:tblGrid>` +
    `<w:tr>${opts.cols.map(cell).join("")}</w:tr></w:tbl>`
  );
}

const nums = (xml: string, re: RegExp) => [...xml.matchAll(re)].map((m) => Number(m[1]));

test("טבלה של 9360 בדף A4 (טקסט 8306) מכווצת בדיוק לרוחב הטקסט", () => {
  const xml = docXml(table({ tblW: `<w:tblW w:w="9360" w:type="dxa"/>`, cols: [3600, 5760] }));
  const out = fitTablesToPageXml(xml)!;
  assert.ok(out);
  const grid = nums(out, /<w:gridCol w:w="(\d+)"/g);
  assert.equal(grid.reduce((a, b) => a + b, 0), 8306);
  assert.ok(grid[0] < grid[1], "היחס בין העמודות נשמר");
  assert.deepEqual(nums(out, /<w:tblW w:w="(\d+)"/g), [8306]);
  const tc = nums(out, /<w:tcW w:w="(\d+)"/g);
  assert.ok(Math.abs(tc[0] - grid[0]) <= 1 && Math.abs(tc[1] - grid[1]) <= 1);
});

test("טבלה שנכנסת בדף - null (בלי שינוי בבייטים)", () => {
  assert.equal(fitTablesToPageXml(docXml(table({ tblW: `<w:tblW w:w="8306" w:type="dxa"/>`, cols: [3000, 5306] }))), null);
});

test("רוחב באחוזים - לא נוגעים", () => {
  assert.equal(fitTablesToPageXml(docXml(table({ tblW: `<w:tblW w:w="5000" w:type="pct"/>`, cols: [5000, 5000] }))), null);
});

test("הזחה חיובית נחשבת: הטבלה נכנסת ברוחב הטקסט פחות ההזחה", () => {
  const out = fitTablesToPageXml(docXml(table({ tblW: `<w:tblW w:w="9360" w:type="dxa"/>`, ind: 400, cols: [4680, 4680] })))!;
  assert.equal(nums(out, /<w:gridCol w:w="(\d+)"/g).reduce((a, b) => a + b, 0), 8306 - 400);
});

test("טבלה מקוננת - הטבלה החיצונית לא נוגעים בה", () => {
  const inner = table({ cols: [4000, 4000] });
  assert.equal(fitTablesToPageXml(docXml(table({ cols: [4680, 4680], inner: inner + "<w:p/>" }))), null);
});

test("מקטע עם שוליים אחרים: משתמשים ב-sectPr של המקטע של הטבלה", () => {
  const wide = `<w:p><w:pPr><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:pPr></w:p>`;
  // הטבלה במקטע הראשון (landscape, טקסט 13958) - נכנסת; אחרי ה-sectPr שלו מקטע A4 רגיל
  const xml = docXml(table({ cols: [4680, 4680] }) + wide + table({ cols: [4680, 4680] }));
  const out = fitTablesToPageXml(xml)!;
  const tables = out.split("<w:tbl>").slice(1);
  assert.equal(nums(tables[0], /<w:gridCol w:w="(\d+)"/g).reduce((a, b) => a + b, 0), 9360);
  assert.equal(nums(tables[1], /<w:gridCol w:w="(\d+)"/g).reduce((a, b) => a + b, 0), 8306);
});

test("docx: בייטים מתוקנים; קובץ שאין בו מה לתקן חוזר כאותו אובייקט; יציב בין הרצות", async () => {
  const mk = async (body: string) => {
    const zip = new JSZip();
    zip.file("word/document.xml", docXml(body), { date: new Date("2026-01-01T00:00:00Z"), createFolders: false });
    return await zip.generateAsync({ type: "uint8array" });
  };
  const bad = await mk(table({ tblW: `<w:tblW w:w="9360" w:type="dxa"/>`, cols: [3600, 5760] }));
  const a = await fitTablesToPage(bad);
  const b = await fitTablesToPage(bad);
  assert.notEqual(a, bad);
  assert.deepEqual(a, b);
  const ok = await mk(table({ cols: [3000, 3000] }));
  assert.equal(await fitTablesToPage(ok), ok);
});
