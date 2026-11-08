/**
 * בדיקות להתאמת החיפוש החכם (search-match). הרצה:
 *   npx tsx --test scripts/search-match.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { normalize, rankItems, toHebrewNumeral, tokenize, type SearchItem } from "../src/lib/search-match";

type M = SearchItem & { id: number; downloads?: number };
const mat = (id: number, title: string, ancestors: string[], kind = "other", downloads = 0): M => ({ id, title, ancestors, kind, downloads });
const CATALOG: M[] = [
  mat(1, "דף לתלמידה - פרק יג", ["תורה", "בגרות 3 יחידות", "בא", 'פרק י"ג'], "student_sheet"),
  mat(2, "דף למורה - פרק יג", ["תורה", "בגרות 3 יחידות", "בא", 'פרק י"ג'], "teacher_sheet"),
  mat(3, "דף לתלמידה - פרק יג", ["תורה", "בגרות 3 יחידות", "בשלח", 'פרק י"ג'], "student_sheet"),
  mat(4, "דף לתלמידה - פרק טו", ["תורה", "בגרות 3 יחידות", "בא", 'פרק ט"ו'], "student_sheet"),
  mat(5, "בוחן עם תשובות - פרק יב", ["תורה", "בגרות 3 יחידות", "בא", 'פרק י"ב'], "other"),
  mat(6, "מצגת מלווה", ["תהלים", "הגבר", 'פרק נ"א'], "presentation"),
];
const ids = (q: string) => rankItems(q, CATALOG, (x) => x, (x) => x.downloads ?? 0).items.map((x) => x.id);

test("נרמול: בלי גרשיים/ניקוד/מקפים", () => {
  assert.equal(normalize('פרק י"ג – (בָּא)'), "פרק יג בא");
});

test("ספרות → אותיות", () => {
  assert.equal(toHebrewNumeral(13), "יג");
  assert.equal(toHebrewNumeral(15), "טו");
  assert.equal(toHebrewNumeral(16), "טז");
  assert.equal(toHebrewNumeral(51), "נא");
  assert.deepEqual(tokenize("פרק 13"), ["פרק", "יג"]);
});

test("הדוגמה: 'פרשת בא פרק יג לתלמידה' מוצא את הדף בתיקיית בא/פרק יג - ראשון", () => {
  assert.deepEqual(ids("פרשת בא פרק יג לתלמידה"), [1]);
});

test("בלי 'פרשת' ובמספר: 'בא פרק 13 תלמידה'", () => {
  assert.deepEqual(ids("בא פרק 13 תלמידה"), [1]);
});

test("סדר מילים חופשי", () => {
  assert.deepEqual(ids("לתלמידה יג בא"), [1]);
});

test("בלי סוג קובץ: כל הקבצים בתיקייה, ולא תיקיות אחרות", () => {
  assert.deepEqual(ids("בא פרק יג").sort(), [1, 2]);
});

test("'למורה' מכוון לדף המורה", () => {
  assert.deepEqual(ids("בא יג למורה"), [2]);
});

test("סוג קובץ תואם גם כשהכותרת לא כוללת את המילה ('מצגת' ← kind)", () => {
  assert.deepEqual(ids("תהלים נא מצגת"), [6]);
});

test("מספר קצר חייב להתאים כמילה שלמה (יג ≠ יג בתוך מילה אחרת)", () => {
  assert.deepEqual(ids("יב"), [5]);
});

test("אין תוצאה מלאה: תוצאות קרובות (חסרה מילה אחת, 3+ מילים)", () => {
  const r = rankItems("בא פרק יג מצגת תלמידה", CATALOG, (x) => x);
  assert.equal(r.approx, true);
  assert.ok(r.items.some((x) => x.id === 1));
});

test("שתי מילים בלי התאמה מלאה - אין 'קרובות' (לא מנחשים)", () => {
  const r = rankItems("בא תהלים", CATALOG, (x) => x);
  assert.deepEqual(r.items, []);
});

test("שאילתה של מילות מילוי בלבד ('פרק') עדיין מחפשת", () => {
  assert.ok(ids("פרק").length >= 5);
});

test("דירוג: התאמה בכותרת הפריט לפני התאמה באבות", () => {
  const items: M[] = [mat(10, "משהו אחר", ["בא", 'פרק י"ג']), mat(11, "בא", ["כללי"])];
  assert.deepEqual(rankItems("בא", items, (x) => x).items.map((x) => x.id), [11, 10]);
});

// ---- גרסאות מילים: כתיב, ריבוי, כינויים, מספרים ----
import { fromHebrewNumeral, loose, needlesOf } from "../src/lib/search-match";

const CAT2: M[] = [
  mat(20, "תהלים – שאלון חיצוני (3 ו-5 יח\"ל)", ["כתובים"], "other"),
  mat(21, "נביא", [], "other"),
  mat(22, "שאלון חיצוני (3 ו-5 יח\"ל) – נביאים אחרונים", ["נביא"], "other"),
  mat(23, "ירמיה", ["נביא", "שאלון חיצוני (3 ו-5 יח\"ל) – נביאים אחרונים"], "other"),
  mat(24, "ישעיה", ["נביא", "שאלון חיצוני (3 ו-5 יח\"ל) – נביאים אחרונים"], "other"),
  mat(25, "בגרות 3 יחידות", ["תורה"], "other"),
  mat(26, "מערכת הצורות", [], "other"),
  mat(27, "תחביר", [], "other"),
  mat(28, "דינים", [], "other"),
  mat(29, "כתובים", [], "other"),
  mat(30, "תורה", [], "other"),
  mat(31, "בשלח", ["תורה"], "other"),
  mat(32, "שלח", ["תורה"], "other"),
  mat(33, "מגילת רות", ["כתובים"], "other"),
];
const ids2 = (q: string) => rankItems(q, CAT2, (x) => x).items.map((x) => x.id);

test("מספרים עבריים: תקינים בלבד", () => {
  assert.equal(fromHebrewNumeral("יג"), 13);
  assert.equal(fromHebrewNumeral("טו"), 15);
  assert.equal(fromHebrewNumeral("טז"), 16);
  assert.equal(fromHebrewNumeral("נא"), 51);
  assert.equal(fromHebrewNumeral("קכג"), 123);
  assert.equal(fromHebrewNumeral("בא"), null); // לא מספר
  assert.equal(fromHebrewNumeral("תהלים"), null);
});

test("כתיב מלא/חסר: 'תהילים' מוצא 'תהלים' ולהפך", () => {
  assert.equal(loose("תהילים"), loose("תהלים"));
  assert.deepEqual(ids2("תהילים"), [20]);
  assert.deepEqual(ids2("תהלים"), [20]);
});

test("שמות עם סיומת וי\"ו: ירמיהו = ירמיה, ישעיהו = ישעיה", () => {
  assert.deepEqual(ids2("ירמיהו").slice(0, 1), [23]);
  assert.deepEqual(ids2("ישעיהו").slice(0, 1), [24]);
});

test("ריבוי/יחיד: 'נביאים' מוצא את 'נביא' ו'נביא' מוצא את 'נביאים'", () => {
  assert.ok(ids2("נביאים").includes(21));
  assert.ok(ids2("נביא").includes(22));
  assert.ok(ids2("נבאים").includes(22), "גם בכתיב חסר: נבאים");
});

test("התאמה מדויקת קודמת להתאמה בגרסה: 'נביא' → הצומת 'נביא' לפני 'נביאים אחרונים'", () => {
  assert.equal(ids2("נביא")[0], 21);
});

test("כינויים: תנ\"ך → תורה/נביא/כתובים; לשון → מערכת הצורות/תחביר; הלכות → דינים", () => {
  const tanach = ids2('תנ"ך');
  for (const id of [30, 21, 29]) assert.ok(tanach.includes(id), "תנ\"ך חייב לכלול " + id);
  const lashon = ids2("לשון");
  assert.ok(lashon.includes(26) && lashon.includes(27));
  assert.ok(ids2("הלכות").includes(28));
});

test("מספר בספרה ובאותיות: 'בגרות 3 יחידות' ו'בגרות ג יחידות' ו'בגרות שלוש יחידות' מוצאים את 'בגרות 3 יחידות'", () => {
  for (const q of ["בגרות 3 יחידות", "בגרות ג יחידות", "בגרות שלוש יחידות"]) assert.ok(ids2(q).includes(25), q);
});

test("'יח\"ל' ↔ 'יחידות'", () => {
  assert.ok(ids2("3 יחידות שאלון").includes(22) || ids2("שאלון 3 יחידות").includes(22));
  assert.ok(ids2("תהלים יחידות 5").includes(20));
});

test("לא מכשילים את העיקרון: 'בשלח' לא מוצא 'שלח' (אבל 'שלח' מוצא את 'בשלח' כתת-מחרוזת כמו קודם)", () => {
  assert.deepEqual(ids2("בשלח"), [31]);
});

test("שאילתה של שם ספר לא מחזירה זבל: 'תהילים' לא מוצא את 'מגילת רות'", () => {
  assert.ok(!ids2("תהילים").includes(33));
});

test("גרסאות: המילה עצמה תמיד ראשונה במשקל 1", () => {
  const n = needlesOf("נביאים");
  assert.equal(n[0].text, "נביאים");
  assert.equal(n[0].weight, 1);
  assert.ok(n.some((x) => x.text === "נביא"));
});

test("שורש קצר לא יוצר רעש: 'תהלים' לא מוצא 'תהליכי'/'תהילה', 'כשרות' לא מוצא 'כישורי'", () => {
  const items: M[] = [mat(40, "תהליכי קבלת החלטות", []), mat(41, "לישרים תהילה", []), mat(42, "תהלים", []), mat(43, "כישורי חיים", []), mat(44, "כשרות", [])];
  assert.deepEqual(rankItems("תהלים", items, (x) => x).items.map((x) => x.id), [42]);
  assert.deepEqual(rankItems("תהילים", items, (x) => x).items.map((x) => x.id), [42]);
  assert.deepEqual(rankItems("כשרות", items, (x) => x).items.map((x) => x.id), [44]);
});

test("מילה בנקבה ('לתלמידה') לא הופכת ל'תלמיד' וממשיכה להתאים רק לסוג הקובץ", () => {
  const items: M[] = [mat(50, "לימוד לתלמידים", []), mat(51, "דף", ["פרק"], "student_sheet")];
  assert.deepEqual(rankItems("לתלמידה", items, (x) => x).items.map((x) => x.id), [51]);
});

test("דירוג כינויים: תנ\"ך - הצמתים תורה/נביא/כתובים לפני כותרת שרק מכילה 'תורה'", () => {
  const items: M[] = [mat(60, "רמב\"ן על התורה – קטעים", ["בגרות"]), mat(61, "תורה", []), mat(62, "נביא", []), mat(63, "כתובים", [])];
  const r = rankItems('תנ"ך', items, (x) => x).items.map((x) => x.id);
  assert.deepEqual(r.slice(0, 3).sort(), [61, 62, 63]);
});

test("כתיב חסר/מלא בלי התנגשות בין מילים שונות: 'ספרות' ≠ 'ספרית'/'סיפורת', 'משלי' ≠ 'ממשלה'", () => {
  const items: M[] = [mat(70, "ספרות", []), mat(71, "הערכה בית ספרית", []), mat(72, "פרוזה – סיפורת", []), mat(73, "משלי", []), mat(74, "ממשלה", []), mat(75, "משלים עבריים", [])];
  assert.deepEqual(rankItems("ספרות", items, (x) => x).items.map((x) => x.id), [70]);
  assert.ok(!rankItems("משלי", items, (x) => x).items.some((x) => x.id === 74));
  assert.equal(rankItems("משלי", items, (x) => x).items[0].id, 73);
});

test("ו' חסרה/מלאה: 'ירמיהו' ↔ 'ירמיה', ו'יי' ↔ 'י': 'תהילים' ↔ 'תהלים' (כל אות בנפרד)", () => {
  const items: M[] = [mat(80, "ירמיה", []), mat(81, "תהלים", [])];
  assert.deepEqual(rankItems("ירמיהו", items, (x) => x).items.map((x) => x.id), [80]);
  assert.deepEqual(rankItems("תהילים", items, (x) => x).items.map((x) => x.id), [81]);
});

test("סיומת 'ות' לא הופכת לשורש: 'ספרות' לא מוצא 'ספר החינוך'", () => {
  const items: M[] = [mat(90, "ספרות", []), mat(91, "ספר החינוך", []), mat(92, "פרק א", ["ספרות"])];
  assert.deepEqual(rankItems("ספרות", items, (x) => x).items.map((x) => x.id).sort(), [90, 92]);
});
