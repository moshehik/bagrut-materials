/**
 * בדיקות למנוע הניד (docs/gemini-pool-portable.mjs) עם fetch מדומה – בלי רשת ובלי מפתחות אמיתיים. הרצה:
 *   node --test scripts/gemini-pool-portable.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiPool, parseJsonLoose, parseKeys } from "../docs/gemini-pool-portable.mjs";

const ok = (text) => ({ status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) });
const fail = (status, error = "x") => ({ status, text: async () => JSON.stringify({ error: { message: error } }) });

/** fetch מדומה: script(model, key, n) → תשובה; רושם כל קריאה */
function mock(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const model = /models\/([^:]+):/.exec(url)[1];
    const key = init.headers["x-goog-api-key"];
    calls.push({ model, key, url });
    return script(model, key, calls.length);
  };
  return { fetchImpl, calls };
}
const pool = (script, keys = "AAAA1111,BBBB2222", extra = {}) => {
  const m = mock(script);
  const p = createGeminiPool({ env: { GEMINI_API_KEYS: keys }, fetchImpl: m.fetchImpl, ...extra });
  return { p, calls: m.calls };
};

test("parseKeys: splits on comma/space/newline, de-duplicates", () => {
  assert.deepEqual(parseKeys("a, b;c\nd a"), ["a", "b", "c", "d"]);
});

test("key travels in a header, never in the URL", async () => {
  const { p, calls } = pool(() => ok("שלום"));
  const r = await p.generate({ prompt: "hi" });
  assert.equal(r.text, "שלום");
  assert.ok(!calls[0].url.includes("AAAA1111") && !calls[0].url.includes("key="));
});

test("429 on one key rotates to the next key, same model", async () => {
  const { p, calls } = pool((model, key) => (key === "AAAA1111" ? fail(429) : ok("תשובה")));
  const r = await p.generate({ prompt: "hi" });
  assert.equal(r.key, "2222");
  assert.equal(calls[0].model, calls[1].model);
  const st = await p.status();
  assert.equal(st.keys.find((k) => k.key === "…1111").fail, 1);
});

test("a cooled-down key is skipped on the next call", async () => {
  const { p, calls } = pool((model, key) => (key === "AAAA1111" ? fail(403) : ok("x")));
  await p.generate({ prompt: "1" });
  const before = calls.length;
  await p.generate({ prompt: "2" });
  assert.ok(calls.slice(before).every((c) => c.key === "BBBB2222"));
});

test("invalid key (400 API key not valid) cools the key for all models", async () => {
  const { p } = pool((model, key) => (key === "AAAA1111" ? fail(400, "API key not valid") : ok("x")));
  await p.generate({ prompt: "1" });
  assert.ok((await p.status()).keys.find((k) => k.key === "…1111").coolingSec > 3000);
});

test("500 moves to the next model without trying other keys", async () => {
  const { p, calls } = pool((model) => (calls0(model) ? fail(500) : ok("מודל שני")));
  function calls0(model) { return model === "gemini-3-flash-preview"; }
  const r = await p.generate({ prompt: "hi" });
  assert.equal(r.text, "מודל שני");
  assert.equal(calls.filter((c) => c.model === "gemini-3-flash-preview").length, 1);
});

test("two 503s on a model move to the next model", async () => {
  const { p, calls } = pool((model) => (model === "gemini-3-flash-preview" ? fail(503) : ok("x")));
  await p.generate({ prompt: "hi" });
  assert.equal(calls.filter((c) => c.model === "gemini-3-flash-preview").length, 2);
});

test("accept() rejects bad answers; rejectedText survives when all fail", async () => {
  const { p } = pool(() => ok("مرحبا שלום"), "AAAA1111,BBBB2222");
  await assert.rejects(
    p.generate({ prompt: "hi", accept: (t) => !/[؀-ۿ]/.test(t) }),
    (e) => e.rejectedText === "مرحبا שלום" && e.attempts.some((a) => a.status === "rejected"),
  );
});

test("no keys → NO_KEYS error", async () => {
  const p = createGeminiPool({ env: {}, fetchImpl: async () => ok("x") });
  await assert.rejects(p.generate({ prompt: "hi" }), (e) => e.code === "NO_KEYS");
});

test("fallback key source is used only when env is empty", async () => {
  const m = mock(() => ok("x"));
  const p = createGeminiPool({ env: {}, fetchImpl: m.fetchImpl, loadKeysFallback: async () => "CCCC3333" });
  await p.generate({ prompt: "hi" });
  assert.equal(m.calls[0].key, "CCCC3333");
  assert.equal((await p.status()).source, "fallback");
});

test("successive calls start from the next key (load spreading)", async () => {
  const { p, calls } = pool(() => ok("x"));
  await p.generate({ prompt: "1" });
  await p.generate({ prompt: "2" });
  assert.deepEqual(calls.map((c) => c.key), ["AAAA1111", "BBBB2222"]);
});

test("thought parts are ignored; empty answer (safety block) moves on", async () => {
  const mixed = { status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "חשיבה", thought: true }, { text: "תשובה" }] } }] }) };
  const { p } = pool(() => mixed);
  assert.equal((await p.generate({ prompt: "hi" })).text, "תשובה");
  const blocked = { status: 200, text: async () => JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }) };
  const q = pool(() => blocked).p;
  await assert.rejects(q.generate({ prompt: "hi" }), /empty: SAFETY/);
});

test("parseJsonLoose handles fences and surrounding text", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('הנה: {"a":2} תודה'), { a: 2 });
  assert.equal(parseJsonLoose("אין"), null);
});
