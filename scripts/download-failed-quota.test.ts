/**
 * בדיקות בלי מסד נתונים: אימות הטוקן של הורדה (dlt) שמשמש גם לעוגייה וגם להחזרת מכסה בהורדה שנכשלה.
 * הרצה: npx tsx --test scripts/download-failed-quota.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DL_TOKEN_RE, dlTokenOf, markDownloadReady } from "../src/lib/download-ready";

const u = (q: string) => new URL(`https://example.test/api/download/5${q}`);

test("dlTokenOf – טוקנים תקינים", () => {
  assert.equal(dlTokenOf(u("?dlt=abc123")), "abc123");
  assert.equal(dlTokenOf(u("?dlt=k3j9x0q1zp")), "k3j9x0q1zp");
  assert.equal(dlTokenOf(u(`?dlt=${"a".repeat(32)}`)), "a".repeat(32));
});

test("dlTokenOf – טוקנים לא תקינים או חסרים", () => {
  assert.equal(dlTokenOf(u("")), null);
  assert.equal(dlTokenOf(u("?dlt=")), null);
  assert.equal(dlTokenOf(u("?dlt=abc")), null); // קצר מדי
  assert.equal(dlTokenOf(u(`?dlt=${"a".repeat(33)}`)), null); // ארוך מדי
  assert.equal(dlTokenOf(u("?dlt=ABCDEF12")), null); // אותיות גדולות
  assert.equal(dlTokenOf(u("?dlt=abc%20123")), null);
  assert.equal(dlTokenOf(u("?dlt=abc123';drop")), null);
});

test("DL_TOKEN_RE – כל טוקן שהלקוח מייצר עובר", () => {
  for (let i = 0; i < 500; i++) {
    const t = Math.random().toString(36).slice(2, 12).padEnd(8, "0");
    assert.ok(DL_TOKEN_RE.test(t), t);
  }
});

test("markDownloadReady – עוגייה רק לטוקן תקין", () => {
  const ok = markDownloadReady(u("?dlt=abc123"), new Response("x"));
  assert.match(ok.headers.get("set-cookie") ?? "", /^dl_abc123=1;/);
  const bad = markDownloadReady(u("?dlt=NOPE"), new Response("x"));
  assert.equal(bad.headers.get("set-cookie"), null);
});
