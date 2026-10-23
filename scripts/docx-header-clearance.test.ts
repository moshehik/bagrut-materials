/**
 * בדיקות להרחבת השוליים העליונים מול לוגו צף בכותרת (docx-header-clearance). הרצה:
 *   npx tsx --test scripts/docx-header-clearance.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { clearHeaderLogo, clearHeaderLogoXml, headerOverhangTwips, requiredTopMargin } from "../src/lib/docx-header-clearance";

const anchor = (offset = -91440, cy = 512064, wrap = "<wp:wrapNone/>", from = "paragraph") =>
  `<w:hdr><w:p><w:r><w:drawing><wp:anchor><wp:positionV relativeFrom="${from}"><wp:posOffset>${offset}</wp:posOffset></wp:positionV><wp:extent cx="910336" cy="${cy}"/>${wrap}</wp:anchor></w:drawing></w:r></w:p></w:hdr>`;
const sect = (top: number, header = 708) =>
  `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${top}" w:right="1080" w:bottom="850" w:left="1080" w:header="${header}" w:footer="708"/></w:sectPr>`;
const doc = (s: string) => `<w:document><w:body><w:p/>${s}</w:body></w:document>`;
const topOf = (xml: string) => Number(xml.match(/w:top="(\d+)"/)![1]);

test("הלוגו האמיתי: בולט 662 twips מתחת לכותרת → שוליים נדרשים 1410", () => {
  assert.equal(headerOverhangTwips(anchor()), 662);
  assert.equal(requiredTopMargin(708, 662), 1410);
});

test("שוליים 720 (דפי העשרה) מוגדלים ל-1410", () => {
  const out = clearHeaderLogoXml(doc(sect(720)), new Map([["rIdH", anchor()]]))!;
  assert.equal(topOf(out), 1410);
});

test("שוליים שמספיקים (1440 כמו בבחנים) - לא נוגעים; 1300 מוגדלים", () => {
  assert.equal(clearHeaderLogoXml(doc(sect(1440)), new Map([["rIdH", anchor()]])), null);
  assert.equal(topOf(clearHeaderLogoXml(doc(sect(1300)), new Map([["rIdH", anchor()]]))!), 1410);
});

test("כותרת בלי ציור צף / עם עטיפה / יחסי לעמוד - לא נוגעים", () => {
  const plain = "<w:hdr><w:p><w:r><w:t>בס\"ד</w:t></w:r></w:p></w:hdr>";
  assert.equal(clearHeaderLogoXml(doc(sect(720)), new Map([["rIdH", plain]])), null);
  assert.equal(clearHeaderLogoXml(doc(sect(720)), new Map([["rIdH", anchor(-91440, 512064, "<wp:wrapSquare/>")]])), null);
  assert.equal(clearHeaderLogoXml(doc(sect(720)), new Map([["rIdH", anchor(-91440, 512064, "<wp:wrapNone/>", "page")]])), null);
});

test("מקטע בלי הפניה לכותרת - לא נוגעים", () => {
  assert.equal(clearHeaderLogoXml(doc(sect(720).replace(/<w:headerReference[^>]*\/>/, "")), new Map([["rIdH", anchor()]])), null);
});

test("docx: בייטים מתוקנים ויציבים; קובץ בלי מה לתקן חוזר כאותו אובייקט", async () => {
  const mk = async (top: number) => {
    const zip = new JSZip();
    const d = new Date("2026-01-01T00:00:00Z");
    zip.file("word/document.xml", doc(sect(top)), { date: d, createFolders: false });
    zip.file("word/header1.xml", anchor(), { date: d, createFolders: false });
    zip.file("word/_rels/document.xml.rels", `<Relationships><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`, { date: d, createFolders: false });
    return await zip.generateAsync({ type: "uint8array" });
  };
  const bad = await mk(720);
  const a = await clearHeaderLogo(bad);
  assert.notEqual(a, bad);
  assert.deepEqual(a, await clearHeaderLogo(bad));
  const ok = await mk(2000);
  assert.equal(await clearHeaderLogo(ok), ok);
});
