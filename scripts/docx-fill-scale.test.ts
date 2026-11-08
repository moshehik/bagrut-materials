/**
 * בדיקות להגדרה האישית "יחס אורך קווי-המילוי". הרצה:
 *   npx tsx --test scripts/docx-fill-scale.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { scaleFillLinesXml, scaledRunLength } from "../src/lib/docx-fill-scale";
import { fixBlankLinesXml, relaxJustifiedBlankLines } from "../src/lib/docx-blank-lines";
import { clampFillLinePercent, fillLinePercentOptions, fillLinePercentToScale } from "../src/lib/fill-line-pref";

const ZW = "​";
const doc = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
const run = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
const visible = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const JC = `<w:pPr><w:jc w:val="both"/></w:pPr>`;

test("נרמול ההגדרה: ברירת מחדל, צעד, טווח, ערכים פגומים", () => {
  assert.equal(clampFillLinePercent(undefined), 100);
  assert.equal(clampFillLinePercent(null), 100);
  assert.equal(clampFillLinePercent(""), 100);
  assert.equal(clampFillLinePercent("abc"), 100);
  assert.equal(clampFillLinePercent(NaN), 100);
  assert.equal(clampFillLinePercent(Infinity), 100);
  assert.equal(clampFillLinePercent(100), 100);
  assert.equal(clampFillLinePercent("150"), 150);
  assert.equal(clampFillLinePercent(123), 120);
  assert.equal(clampFillLinePercent(10), 50);
  assert.equal(clampFillLinePercent(999), 200);
  assert.equal(fillLinePercentToScale(150), 1.5);
  assert.equal(fillLinePercentToScale("junk"), 1);
  const opts = fillLinePercentOptions();
  assert.equal(opts[0], 50);
  assert.equal(opts.at(-1), 200);
  assert.ok(opts.includes(100));
});

test("מקדם 1 / לא תקין / אין קווים - null (אותם בייטים)", () => {
  const xml = doc(`<w:p>${run("שם: ____________")}</w:p>`);
  assert.equal(scaleFillLinesXml(xml, 1), null);
  assert.equal(scaleFillLinesXml(xml, 0), null);
  assert.equal(scaleFillLinesXml(xml, -2), null);
  assert.equal(scaleFillLinesXml(xml, NaN), null);
  assert.equal(scaleFillLinesXml(doc(`<w:p>${run("טקסט בלי קווים")}</w:p>`), 1.5), null);
});

test("הגדלה והקטנה של קו רציף; הטקסט שסביבו לא משתנה", () => {
  const xml = doc(`<w:p>${run("תשובה: " + "_".repeat(20) + " (נקודה).")}</w:p>`);
  assert.equal(visible(scaleFillLinesXml(xml, 1.5)!), "תשובה: " + "_".repeat(30) + " (נקודה).");
  assert.equal(visible(scaleFillLinesXml(xml, 0.5)!), "תשובה: " + "_".repeat(10) + " (נקודה).");
});

test("ריצות קצרות (1-2) לא נחשבות קו מילוי; ריצה של 3 לא יורדת מתחת ל-3", () => {
  const xml = doc(`<w:p>${run("א__ב ___ ג_ד")}</w:p>`);
  assert.equal(scaleFillLinesXml(xml, 2), visibleReplace(xml, "א__ב ______ ג_ד"));
  assert.equal(scaleFillLinesXml(xml, 0.5), null);
  assert.equal(scaledRunLength(4, 0.5), 3);
});

function visibleReplace(xml: string, text: string) {
  return xml.replace(/(<w:t[^>]*>)[^<]*(<\/w:t>)/, `$1${text}$2`);
}

test("קו שביר (עם U+200B) נשאר שביר באורך החדש; בלי U+200B נשאר רציף", () => {
  const breakable = ["_".repeat(8), "_".repeat(8), "_".repeat(8)].join(ZW); // 24
  const out = scaleFillLinesXml(doc(`<w:p>${run("א " + breakable)}</w:p>`), 0.5)!; // → 12
  assert.equal(visible(out), "א " + ["_".repeat(8), "_".repeat(4)].join(ZW));
  const grown = scaleFillLinesXml(doc(`<w:p>${run(breakable)}</w:p>`), 2)!; // → 48
  assert.equal(visible(grown), Array(6).fill("_".repeat(8)).join(ZW));
  assert.ok(!visible(grown).endsWith(ZW));
  const plain = scaleFillLinesXml(doc(`<w:p>${run("_".repeat(10))}</w:p>`), 2)!;
  assert.equal(visible(plain), "_".repeat(20));
});

test("נוגע רק בתוכן <w:t>; לא ב-delText / instrText / תגיות", () => {
  const xml = doc(`<w:p><w:r><w:delText>${"_".repeat(10)}</w:delText></w:r><w:r><w:instrText>${"_".repeat(10)}</w:instrText></w:r>${run("_".repeat(10))}</w:p>`);
  const out = scaleFillLinesXml(xml, 2)!;
  assert.equal((out.match(/(?<!_)_{10}(?!_)/g) ?? []).length, 2); // delText + instrText ללא שינוי
  assert.equal((out.match(/(?<!_)_{20}(?!_)/g) ?? []).length, 1); // ה-<w:t> הוכפל
});

test("תקרת בטיחות לריצה אחת", () => {
  assert.equal(scaledRunLength(300, 2), 400);
});

test("fixBlankLinesXml: בלי fillScale / עם 1 - בדיוק כמו קודם; עם מקדם - הקו הארוך נעשה שביר והיישור נשמר", () => {
  const xml = doc(`<w:p>${JC}${run("לפי רש\"י - ")}${run("_".repeat(20))}</w:p>`);
  const base = fixBlankLinesXml(xml);
  assert.equal(fixBlankLinesXml(xml, {}), base);
  assert.equal(fixBlankLinesXml(xml, { fillScale: 1 }), base);
  const big = fixBlankLinesXml(xml, { fillScale: 2 })!;
  assert.equal(visible(big).replace(new RegExp(ZW, "g"), ""), "לפי רש\"י - " + "_".repeat(40));
  assert.ok(big.includes(ZW), "הקו המוגדל שביר");
  assert.ok(big.includes('w:val="both"'), "הפסקה נשארת מיושרת");
});

test("fixBlankLinesXml: קו שהוקטן מתחת לסף - לא נשאר חסר-תועלת, והיישור נשמר", () => {
  const xml = doc(`<w:p>${JC}${run("שם: ")}${run("_".repeat(10))}</w:p>`);
  const out = fixBlankLinesXml(xml, { fillScale: 0.5 })!;
  assert.equal(visible(out), "שם: _____");
  assert.ok(out.includes('w:val="both"'));
});

test("חורי-רווחים מומרים לקווים *ואז* מותאמים למקדם", () => {
  const xml = doc(`<w:p>${run("אם יבינו ")}${run("          ")}${run(" באה")}</w:p>`); // 10 רווחים
  const out = fixBlankLinesXml(xml, { fillScale: 2 })!;
  assert.equal(visible(out).replace(new RegExp(ZW, "g"), ""), "אם יבינו " + "_".repeat(20) + " באה");
});

test("docx שלם: אידמפוטנטי לפי ההגדרה, ואותם בייטים כשאין שינוי", async () => {
  const zip = new JSZip();
  const date = new Date("2026-01-01T00:00:00Z");
  zip.file("word/document.xml", doc(`<w:p>${run("שם: " + "_".repeat(12))}</w:p>`), { date, createFolders: false });
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`, { date });
  const docx = await zip.generateAsync({ type: "uint8array" });
  const a = await relaxJustifiedBlankLines(docx, { fillScale: 1.5 });
  const b = await relaxJustifiedBlankLines(docx, { fillScale: 1.5 });
  assert.notEqual(a, docx);
  assert.deepEqual(a, b, "אותם בייטים בכל בקשה (מפתח מטמון ה-PDF יציב)");
  const x = await (await JSZip.loadAsync(a)).file("word/document.xml")!.async("string");
  assert.equal(visible(x).replace(new RegExp(ZW, "g"), ""), "שם: " + "_".repeat(18));
  // קו קצר שהתיקונים האחרים לא נוגעים בו: מקדם 1 / בלי מקדם = בדיוק אותם בייטים
  const z2 = new JSZip();
  z2.file("word/document.xml", doc(`<w:p>${run("שם: ______")}</w:p>`), { date, createFolders: false });
  const clean = await z2.generateAsync({ type: "uint8array" });
  assert.equal(await relaxJustifiedBlankLines(clean, { fillScale: 1 }), clean);
  assert.equal(await relaxJustifiedBlankLines(clean), clean);
});
