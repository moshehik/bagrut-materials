/**
 * בדיקות לתיקוני קווי-המילוי בזמן-הגשה (docx-blank-lines). הרצה:
 *   npx tsx --test scripts/docx-blank-lines.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { fillSpaceBlanksXml, fixBlankLinesXml, relaxJustifiedBlankLines, relaxJustifiedBlankLinesXml } from "../src/lib/docx-blank-lines";

function docXml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

const RPR = `<w:rPr><w:rFonts w:ascii="Assistant" w:hAnsi="Assistant" w:cs="Assistant"/><w:sz w:val="24"/><w:rtl/></w:rPr>`;
const run = (t: string, rPr = RPR) => `<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const JC = `<w:pPr><w:spacing w:after="0"/><w:jc w:val="both"/></w:pPr>`;

/** הפסקה האמיתית מ"דף לתלמידה - גדעון" שבדרייב (2026-10-22): חורים של רווחים בין המילים */
const GIDEON = `<w:p>${JC}${run("תשובה: ")}<w:r>${RPR}<w:t>________________</w:t></w:r>${run(". אם יבינו ")}${run("       ")}${run(" ")}${run("באה בגלל ")}${run("         ")}${run(" ")}${run("זרה, יוכלו ")}${run("         ")}${run(" ")}${run("בתשובה באמת, ")}${run("     ")}${run(" ")}${run("רק לקבל ")}${run("         ")}${run(" ")}${run("בלי לתקן ")}${run("    ")}${run(" ")}${run("הסיבה לצרה.")}</w:p>`;

async function makeDocx(body: string, entry = "word/document.xml"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(entry, docXml(body), { date: new Date("2026-01-01T00:00:00Z"), createFolders: false });
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`, { date: new Date("2026-01-01T00:00:00Z") });
  return await zip.generateAsync({ type: "uint8array" });
}

const visible = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

test("חורים-מרווחים: הפסקה של גדעון - כל 6 החורים הופכים לקווים תחתונים באותו אורך", () => {
  const out = fillSpaceBlanksXml(docXml(GIDEON));
  assert.ok(out);
  assert.equal(
    visible(out),
    "תשובה: ________________. אם יבינו _______ באה בגלל _________ זרה, יוכלו _________ בתשובה באמת, _____ רק לקבל _________ בלי לתקן ____ הסיבה לצרה.",
  );
  // התגים עצמם לא השתנו - רק הטקסט שבתוכם; אותו מספר תווים
  assert.equal(out.length, docXml(GIDEON).length);
  assert.equal((out.match(/<w:t xml:space="preserve">/g) ?? []).length, (GIDEON.match(/<w:t xml:space="preserve">/g) ?? []).length);
});

test("חורים-מרווחים: לא נוגעים ברווחים שאינם בין מילים", () => {
  const cases = [
    `<w:p>${run("שם: _____________")}${run("        ")}</w:p>`, // סוף פסקה (בוחן: "שם: ____" + ריווח)
    `<w:p>${run("שם: _____________")}${run("        ")}${run("תאריך: _______")}</w:p>`, // לפניו "_" (ולא רווח)
    `<w:p>${run("        ")}${run("חטא המרגלים")}</w:p>`, // הזחה בתחילת פסקה
    `<w:p>${run("התאמה: 1-(___)")}${run("     ")}${run("2-(___)")}</w:p>`, // בין פריטים, בלי רווח משני הצדדים
    `<w:p>${run("הביאי את שניהם.")}${run("     ")}${run("_________________________")}</w:p>`, // לפניו "." ואחריו "_"
    `<w:p>${run("מילה ")}${run("   ")}${run(" מילה")}</w:p>`, // 3 רווחים בלבד - פחות מהסף
    `<w:p>${run("ארץ ששם ישבו הכנעני.")}${run("    ")}</w:p>`, // רווחים אחרי נקודה בסוף פסקה
    `<w:p>${run("      ")}</w:p>`, // פסקה של רווחים בלבד
  ];
  for (const c of cases) assert.equal(fillSpaceBlanksXml(docXml(c)), null, c);
});

test("חורים-מרווחים: המילה האחרונה במשפט הושמטה (ריצה בסוף הפסקה אחרי רווח) - מומרת", () => {
  // "בלי ... זוכה לכל «·········»" (דבורה וברק), "מעשה טוב «···········»" (מלכים ב ד) - בלי שום טקסט אחריהן
  const out = fillSpaceBlanksXml(docXml(`<w:p>${JC}${run("זוכה לכל ")}${run("         ")}</w:p>`));
  assert.ok(out);
  assert.equal(visible(out), "זוכה לכל _________");
  // גם כשאחריה נשארו רק רווחים
  const out2 = fillSpaceBlanksXml(docXml(`<w:p>${run("מילה ")}${run("      ")}${run("   ")}</w:p>`));
  assert.ok(out2);
  assert.equal(visible(out2), "מילה ______   ");
});

test("חורים-מרווחים: לא חוצים גבול פסקה (גם של תיבת-טקסט מקוננת)", () => {
  // רווחים בתוך תיבת-הטקסט בלי טקסט לפניהם *באותה* פסקה; ה"לפני" קיים רק בפסקה החיצונית - לא נוגעים
  const xml = docXml(`<w:p>${run("מילה ")}<w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p>${run("      ")}${run(" בתיבה")}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`);
  assert.equal(fillSpaceBlanksXml(xml), null);
  // הרווחים בסוף הטקסט של הפסקה החיצונית, ואחריהם תיבת-טקסט: זו "מילה אחרונה שהושמטה" (מומרת),
  // והטקסט שבתיבה לא נחשב כ"אחרי" ולא משתנה
  const xml2 = docXml(`<w:p>${run("מילה ")}${run("      ")}<w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p>${run("בתיבה")}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`);
  const out2 = fillSpaceBlanksXml(xml2);
  assert.ok(out2);
  assert.equal(visible(out2), "מילה ______בתיבה");
  assert.ok(out2.includes(run("בתיבה")));
});

test("חורים-מרווחים: גם ריצה מקווקוות (w:u) בין מילים מומרת; טקסט בלי רווחים - null", () => {
  const u = RPR.replace("<w:rtl/>", `<w:u w:val="single"/><w:rtl/>`);
  const out = fillSpaceBlanksXml(docXml(`<w:p>${run("לפני ")}${run("      ", u)}${run(" אחרי")}</w:p>`));
  assert.ok(out);
  assert.equal(visible(out), "לפני ______ אחרי");
  assert.equal(fillSpaceBlanksXml(docXml(`<w:p>${run("שורה רגילה בלי חורים")}</w:p>`)), null);
});

test("שחרור יישור: פסקה מיושרת עם ריצת קווים ארוכה - ה-jc מוסר; בלי ריצה - null", () => {
  const xml = docXml(`<w:p>${JC}${run("לפי רש\"י - ")}${run("_".repeat(40))}</w:p>`);
  const out = relaxJustifiedBlankLinesXml(xml);
  assert.ok(out);
  assert.ok(!out.includes(`<w:jc w:val="both"/>`));
  assert.equal(out, xml.replace(`<w:jc w:val="both"/>`, ""));
  assert.equal(relaxJustifiedBlankLinesXml(docXml(`<w:p>${JC}${run("פסקת הסבר רגילה ____ קצרה")}</w:p>`)), null);
});

test("fixBlankLinesXml: שני התיקונים יחד על הפסקה של גדעון; שתי קריאות - אותה תוצאה", () => {
  const xml = docXml(GIDEON);
  const out = fixBlankLinesXml(xml);
  assert.ok(out);
  assert.ok(!out.includes(`<w:jc w:val="both"/>`)); // "________________" (16) ≥ 8 → שורת מילוי
  assert.ok(visible(out).includes("אם יבינו _______ באה בגלל"));
  assert.equal(fixBlankLinesXml(xml), out);
  // חור קצר (5) בפסקה מיושרת בלי ריצה ארוכה: החור מומר, היישור נשאר
  const short = docXml(`<w:p>${JC}${run("אם יבינו ")}${run("     ")}${run(" באה")}</w:p>`);
  const out2 = fixBlankLinesXml(short);
  assert.ok(out2 && out2.includes(`<w:jc w:val="both"/>`) && visible(out2) === "אם יבינו _____ באה");
});

test("docx: התיקון מתבצע, שאר הרשומות נשמרות, בייטים יציבים; קובץ נקי חוזר כאותו אובייקט", async () => {
  const docx = await makeDocx(GIDEON);
  const a = await relaxJustifiedBlankLines(docx);
  const b = await relaxJustifiedBlankLines(docx);
  assert.notEqual(a, docx);
  assert.deepEqual(Buffer.from(a), Buffer.from(b)); // אותו md5 בכל בקשה
  const zip = await JSZip.loadAsync(a);
  assert.deepEqual(Object.keys(zip.files).sort(), ["[Content_Types].xml", "word/document.xml"]);
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.ok(visible(xml).includes("בלי לתקן ____ הסיבה לצרה."));
  const clean = await makeDocx(`<w:p>${JC}${run("שָׁלוֹם")}</w:p>`);
  assert.equal(await relaxJustifiedBlankLines(clean), clean);
});

test("docx: נתיב עם backslash; קלט שאינו zip - מחזיר את המקור בלי לזרוק", async () => {
  const docx = await makeDocx(`<w:p>${run("לפני ")}${run("     ")}${run(" אחרי")}</w:p>`, "word\\document.xml");
  const out = await relaxJustifiedBlankLines(docx);
  assert.notEqual(out, docx);
  assert.ok(visible(await (await JSZip.loadAsync(out)).file("word\\document.xml")!.async("string")).includes("לפני _____ אחרי"));
  const junk = new Uint8Array([1, 2, 3]);
  assert.equal(await relaxJustifiedBlankLines(junk), junk);
});
