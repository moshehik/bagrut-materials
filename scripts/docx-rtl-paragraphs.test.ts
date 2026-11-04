/**
 * בדיקות לתיקון כיוון ימין-לשמאל של פסקאות עבריות והסגנון החסר של הכותרת העליונה (docx-rtl-paragraphs). הרצה:
 *   npx tsx --test scripts/docx-rtl-paragraphs.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { addMissingHeaderStyle, ensureRtlParagraphs, forceRtlParagraphsXml, hasNonBidiSection, rtlParagraph } from "../src/lib/docx-rtl-paragraphs";

const p = (ppr: string, text = "שלום עולם") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;

test("פסקה מיושרת-לשני-הצדדים בלי bidi מקבלת bidi לפני spacing/jc", () => {
  const out = rtlParagraph(p('<w:spacing w:after="120"/><w:jc w:val="both"/>'), false);
  assert.match(out, /<w:pPr><w:bidi\/><w:spacing/);
});

test("פסקה בלי pPr מקבלת pPr עם bidi; bidi אחרי pStyle/keepNext/shd", () => {
  assert.match(rtlParagraph(p(""), false), /^<w:p><w:pPr><w:bidi\/><\/w:pPr>/);
  const out = rtlParagraph(p('<w:pStyle w:val="x"/><w:keepNext/><w:shd w:val="clear" w:fill="EEE"/><w:spacing w:after="1"/><w:rPr><w:rtl/></w:rPr>'), false);
  assert.match(out, /<w:shd[^>]*\/><w:bidi\/><w:spacing/);
});

test("לא נוגעים: כבר bidi, אנגלית, הזחה/מספור/טאבים בגוף, יישור left/right", () => {
  const already = p('<w:bidi/><w:jc w:val="both"/>');
  assert.equal(rtlParagraph(already, false), already);
  const en = p('<w:jc w:val="both"/>', "Hello world");
  assert.equal(rtlParagraph(en, false), en);
  for (const ppr of [
    '<w:ind w:left="720"/>',
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
    '<w:tabs><w:tab w:val="center" w:pos="4000"/></w:tabs>',
    '<w:jc w:val="left"/>',
    '<w:jc w:val="right"/>',
  ]) {
    const x = p(ppr);
    assert.equal(rtlParagraph(x, false), x, ppr);
  }
});

test("בכותרת העליונה גם פסקה עם טאבים מקבלת bidi", () => {
  const h = p('<w:pStyle w:val="a3"/><w:tabs><w:tab w:val="center" w:pos="4203"/></w:tabs><w:rPr><w:rtl/></w:rPr>', 'בס"ד');
  assert.match(rtlParagraph(h, true), /<\/w:tabs><w:bidi\/><w:rPr>/);
});

test("hasNonBidiSection: מקטע עם bidi - לא; בלי bidi או בלי מקטע - כן", () => {
  assert.equal(hasNonBidiSection("<w:sectPr><w:pgSz/><w:bidi/></w:sectPr>"), false);
  assert.equal(hasNonBidiSection("<w:sectPr><w:pgSz/></w:sectPr>"), true);
  assert.equal(hasNonBidiSection("<w:body/>"), true);
  assert.equal(forceRtlParagraphsXml("<w:body><w:p><w:r><w:t>abc</w:t></w:r></w:p></w:body>", false), null);
});

test("addMissingHeaderStyle: מוסיף את a3 רק כשהוא חסר ומופנה מהכותרת", () => {
  const styles = '<w:styles><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
  const hdr = '<w:hdr><w:p><w:pPr><w:pStyle w:val="a3"/></w:pPr></w:p></w:hdr>';
  const out = addMissingHeaderStyle(styles, [hdr])!;
  assert.match(out, /w:styleId="a3"/);
  assert.match(out, /<w:basedOn w:val="Normal"\/>/);
  assert.match(out, /w:val="center" w:pos="4153"/);
  assert.equal(addMissingHeaderStyle(out, [hdr]), null);
  assert.equal(addMissingHeaderStyle(styles, ["<w:hdr><w:p/></w:hdr>"]), null);
});

test("docx: מתוקן ויציב; מסמך שכולו bidi חוזר כאותו אובייקט", async () => {
  const mk = async (sect: string, body: string) => {
    const zip = new JSZip();
    const d = new Date("2026-01-01T00:00:00Z");
    zip.file("word/document.xml", `<w:document><w:body>${body}${sect}</w:body></w:document>`, { date: d, createFolders: false });
    zip.file("word/header1.xml", `<w:hdr>${p('<w:pStyle w:val="a3"/>', 'בס"ד')}</w:hdr>`, { date: d, createFolders: false });
    zip.file("word/styles.xml", '<w:styles><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>', { date: d, createFolders: false });
    return await zip.generateAsync({ type: "uint8array" });
  };
  const bad = await mk("<w:sectPr><w:pgSz/></w:sectPr>", p('<w:jc w:val="both"/>'));
  const fixed = await ensureRtlParagraphs(bad);
  assert.notEqual(fixed, bad);
  assert.deepEqual(fixed, await ensureRtlParagraphs(bad));
  const z = await JSZip.loadAsync(fixed);
  assert.match(await z.file("word/document.xml")!.async("string"), /<w:bidi\/><w:jc/);
  assert.match(await z.file("word/header1.xml")!.async("string"), /<w:pStyle w:val="a3"\/><w:bidi\/>/);
  assert.match(await z.file("word/styles.xml")!.async("string"), /w:styleId="a3"/);
  const ok = await mk("<w:sectPr><w:pgSz/><w:bidi/></w:sectPr>", p('<w:jc w:val="both"/>'));
  assert.equal(await ensureRtlParagraphs(ok), ok);
});
