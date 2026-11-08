/** npx tsx --test scripts/netfree-client.test.ts — קריאת עוגיית nf (בלי דפדפן: document מדומה) */
import test from "node:test";
import assert from "node:assert/strict";

function withCookie<T>(cookie: string, fn: () => T): T {
  (globalThis as unknown as { document: { cookie: string } }).document = { cookie };
  try {
    return fn();
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
}

test("netfreeCookie: nf=1 → true, nf=0 → false, חסר → null (גם עם עוגיות אחרות לפניה/אחריה)", async () => {
  const { netfreeCookie } = await import("../src/lib/netfree-client");
  assert.equal(withCookie("nf=1", netfreeCookie), true);
  assert.equal(withCookie("a=b; nf=1; c=d", netfreeCookie), true);
  assert.equal(withCookie("a=b; nf=0", netfreeCookie), false);
  assert.equal(withCookie("a=b; xnf=1", netfreeCookie), null);
  assert.equal(withCookie("", netfreeCookie), null);
});
