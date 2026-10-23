/**
 * בדיקות לקריאה "המגובה" (hedged) שמקצרת את הזנב של שליפת הטוקן מהגשר. הרצה:
 *   npx tsx --test scripts/drive-token-hedge.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { hedged } from "../src/lib/driveBridgeCore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("hedged: תשובה מהירה - קריאה אחת בלבד", async () => {
  let calls = 0;
  const v = await hedged(async () => {
    calls++;
    await sleep(10);
    return "ok";
  }, 200);
  assert.equal(v, "ok");
  assert.equal(calls, 1);
});

test("hedged: קריאה ראשונה תלויה - אחרי hedgeMs הקריאה השנייה מנצחת, בלי לחכות לראשונה", async () => {
  let calls = 0;
  const t = Date.now();
  const v = await hedged(async () => {
    const n = ++calls;
    if (n === 1) await sleep(5000); // תלויה
    else await sleep(20);
    return "call" + n;
  }, 100);
  assert.equal(v, "call2");
  assert.equal(calls, 2);
  assert.ok(Date.now() - t < 1000, "לא חיכה לקריאה האיטית");
});

test("hedged: קריאה ראשונה נכשלה מהר - ניסיון חוזר מיד, והתוצאה שלו", async () => {
  let calls = 0;
  const v = await hedged(async () => {
    if (++calls === 1) throw new Error("boom");
    return "retry-ok";
  }, 500);
  assert.equal(v, "retry-ok");
  assert.equal(calls, 2);
});

test("hedged: שני הניסיונות נכשלים - זורק שגיאה", async () => {
  await assert.rejects(
    hedged(async () => {
      throw new Error("always");
    }, 50),
    /always/,
  );
});

test("hedged: הראשונה איטית אבל מצליחה לפני השנייה האיטית יותר - מנצחת הראשונה", async () => {
  let calls = 0;
  const v = await hedged(async () => {
    const n = ++calls;
    await sleep(n === 1 ? 150 : 400);
    return "call" + n;
  }, 100);
  assert.equal(v, "call1");
});
