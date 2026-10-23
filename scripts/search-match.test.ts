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
