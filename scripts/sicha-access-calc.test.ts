import test from "node:test";
import assert from "node:assert/strict";
import { sichaAccessEnd } from "../src/lib/sicha-access-calc";

const d = (s: string) => new Date(s + "T10:00:00Z");
const ymd = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

test("אין שיחות – אין גישה", () => {
  assert.equal(sichaAccessEnd([]), null);
});

test("שיחה אחת = 3 חודשים", () => {
  assert.equal(ymd(sichaAccessEnd([d("2026-01-10")])), "2026-04-10");
});

test("שיחה שנייה בתוך התקופה מוסיפה 3 חודשים מהסיום", () => {
  assert.equal(ymd(sichaAccessEnd([d("2026-01-10"), d("2026-02-10")])), "2026-07-10");
});

test("שיחה שנייה אחרי שהגישה פגה מתחילה מחדש מרגע ההעלאה", () => {
  assert.equal(ymd(sichaAccessEnd([d("2026-01-10"), d("2026-08-10")])), "2026-11-10");
});

test("תקרה של שנה מההעלאה האחרונה", () => {
  const many = [d("2026-01-10"), d("2026-01-11"), d("2026-01-12"), d("2026-01-13"), d("2026-01-14"), d("2026-01-15")];
  assert.equal(ymd(sichaAccessEnd(many)), "2027-01-15");
});

test("סדר הקלט לא משנה", () => {
  const a = [d("2026-02-10"), d("2026-01-10")];
  const b = [d("2026-01-10"), d("2026-02-10")];
  assert.equal(ymd(sichaAccessEnd(a)), ymd(sichaAccessEnd(b)));
});
