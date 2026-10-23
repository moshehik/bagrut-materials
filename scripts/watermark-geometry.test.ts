/**
 * בדיקות לגאומטריה של סימן המים האלכסוני (watermark-geometry). הרצה:
 *   npx tsx --test scripts/watermark-geometry.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DIAGONAL_DEG, diagonalEnd, diagonalOrigin, fitDiagonalSize } from "../src/lib/watermark-geometry";

const A4 = { w: 595.3, h: 841.9 };
const inside = (p: { x: number; y: number }, w = A4.w, h = A4.h) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;

test("שורה ארוכה (823pt בגודל 33) מתכווצת וכולה בתוך העמוד - הבאג שנמצא ב-PDF האמיתי", () => {
  const widthAt1 = 823 / 33.07;
  const size = fitDiagonalSize(A4.w, A4.h, widthAt1);
  assert.ok(size < 33.07, "הגופן מתכווץ");
  const tw = widthAt1 * size;
  const o = diagonalOrigin(A4.w, A4.h, tw, size);
  assert.ok(inside(o), "ההתחלה בעמוד");
  assert.ok(inside(diagonalEnd(o, tw)), "הסוף בעמוד");
});

test("שורה קצרה לא מוקטנת מעבר לגודל הרגיל, וממורכזת על מרכז העמוד", () => {
  const widthAt1 = 150 / 33;
  const size = fitDiagonalSize(A4.w, A4.h, widthAt1);
  assert.equal(size, Math.max(18, Math.min(A4.w, A4.h) / 18));
  const tw = widthAt1 * size;
  const o = diagonalOrigin(A4.w, A4.h, tw, size);
  const e = diagonalEnd(o, tw);
  // אמצע הקטע (על קו הבסיס) סוטה ממרכז העמוד רק בהסטה האנכית של חצי גובה האותיות
  const mid = { x: (o.x + e.x) / 2, y: (o.y + e.y) / 2 };
  assert.ok(Math.hypot(mid.x - A4.w / 2, mid.y - A4.h / 2) <= 0.35 * size + 0.01);
});

test("עמודים בגדלים שונים (A5, Letter, לרוחב) - השורה נכנסת תמיד", () => {
  for (const [w, h] of [[419.5, 595.3], [612, 792], [841.9, 595.3], [300, 300]]) {
    const widthAt1 = 823 / 33.07;
    const size = fitDiagonalSize(w, h, widthAt1);
    const tw = widthAt1 * size;
    const o = diagonalOrigin(w, h, tw, size);
    if (size > 10) {
      assert.ok(inside(o, w, h) && inside(diagonalEnd(o, tw), w, h), `${w}x${h}`);
    }
  }
});

test("השורה השנייה (השם) מוסטת מתחת לראשית, בניצב", () => {
  const o1 = diagonalOrigin(A4.w, A4.h, 200, 25);
  const o2 = diagonalOrigin(A4.w, A4.h, 200, 25, 37.5);
  const rad = (DIAGONAL_DEG * Math.PI) / 180;
  assert.ok(Math.abs(o2.x - o1.x - 37.5 * Math.sin(rad)) < 1e-9);
  assert.ok(Math.abs(o2.y - o1.y + 37.5 * Math.cos(rad)) < 1e-9);
});

test("מחרוזת באורך אפסי - מחזיר את הגודל הרגיל", () => {
  assert.equal(fitDiagonalSize(A4.w, A4.h, 0), Math.max(18, Math.min(A4.w, A4.h) / 18));
});
