/**
 * בדיקות של אימות ה-API לסוכן (src/lib/agent-api-auth.ts) ושל פרוטוקול הבקשות (src/lib/general-fix-protocol.ts). הרצה:
 *   npx tsx --test scripts/agent-api-auth.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { authorizeAgentRequest, bearerFrom, verifyAgentToken } from "../src/lib/agent-api-auth";
import { agentApiBase, decodeDocxBase64, MAX_DOCX_BYTES, parseAgentRequest, pickAgentMode } from "../src/lib/general-fix-protocol";

const SECRET = "a".repeat(20) + "b".repeat(20); // 40 תווים

test("bearerFrom parses the Authorization header", () => {
  assert.equal(bearerFrom("Bearer abc.def"), "abc.def");
  assert.equal(bearerFrom("bearer  xyz "), "xyz");
  assert.equal(bearerFrom("Basic abc"), null);
  assert.equal(bearerFrom(null), null);
  assert.equal(bearerFrom("Bearer"), null);
});

test("verifyAgentToken: exact match only, secret must be long", () => {
  assert.equal(verifyAgentToken(SECRET, SECRET), true);
  assert.equal(verifyAgentToken(SECRET + "x", SECRET), false);
  assert.equal(verifyAgentToken(SECRET.slice(0, -1), SECRET), false);
  assert.equal(verifyAgentToken("short", "short"), false);
  assert.equal(verifyAgentToken("", SECRET), false);
  assert.equal(verifyAgentToken(SECRET, undefined), false);
});

test("authorizeAgentRequest: 503 when unset, 401 without token, 403 wrong, ok right", () => {
  assert.deepEqual(authorizeAgentRequest(`Bearer ${SECRET}`, undefined).ok, false);
  assert.equal((authorizeAgentRequest(`Bearer ${SECRET}`, "") as { status: number }).status, 503);
  assert.equal((authorizeAgentRequest(`Bearer ${SECRET}`, "tooshort") as { status: number }).status, 503);
  assert.equal((authorizeAgentRequest(null, SECRET) as { status: number }).status, 401);
  assert.equal((authorizeAgentRequest("Bearer nope", SECRET) as { status: number }).status, 403);
  assert.equal(authorizeAgentRequest(`Bearer ${SECRET}`, SECRET).ok, true);
});

const b64 = (s: string) => Buffer.from(s).toString("base64");

test("parseAgentRequest: valid actions, defaults (apply=false, render=true)", () => {
  const list = parseAgentRequest({ action: "list" });
  assert.equal(list.ok, true);
  const check = parseAgentRequest({ action: "check", fixId: "12", docxBase64: b64("PK".padEnd(200, "x")) });
  assert.ok(check.ok && check.req.action === "check" && check.req.fixId === 12 && check.req.render === true);
  const priv = parseAgentRequest({ action: "private", fixId: 3, docxBase64: b64("PK".padEnd(200, "x")), note: "קוצר הדף" });
  assert.ok(priv.ok && priv.req.action === "private" && priv.req.apply === false);
  const merge = parseAgentRequest({ action: "merge", fixId: 3, docxBase64: b64("PK".padEnd(200, "x")), note: "תוקן", why: "טעות בפסוק", apply: true });
  assert.ok(merge.ok && merge.req.action === "merge" && merge.req.apply === true);
});

test("parseAgentRequest: rejects unknown action, missing note/why, oversized body", () => {
  assert.equal(parseAgentRequest({ action: "delete" }).ok, false);
  const noNote = parseAgentRequest({ action: "answer", fixId: 1 });
  assert.ok(!noNote.ok && noNote.status === 400 && /note/.test(noNote.error));
  const noWhy = parseAgentRequest({ action: "merge", fixId: 1, docxBase64: b64("PK".padEnd(200, "x")), note: "תוקן" });
  assert.ok(!noWhy.ok && /why/.test(noWhy.error));
  const big = parseAgentRequest({ action: "list" }, 5_000_000);
  assert.ok(!big.ok && big.status === 413);
  const hugeDocx = parseAgentRequest({ action: "check", fixId: 1, docxBase64: "A".repeat(Math.ceil((MAX_DOCX_BYTES * 4) / 3) + 100) });
  assert.ok(!hugeDocx.ok && /גדול/.test(hugeDocx.error));
});

test("decodeDocxBase64: PK header required, size enforced, data-url prefix tolerated", () => {
  const good = decodeDocxBase64("data:application/octet-stream;base64," + b64("PK\u0003\u0004rest"));
  assert.ok(good.ok && good.bytes[0] === 0x50);
  assert.equal(decodeDocxBase64(b64("not a zip")).ok, false);
  assert.equal(decodeDocxBase64("***").ok, false);
  assert.equal(decodeDocxBase64(Buffer.alloc(MAX_DOCX_BYTES + 1, 0x50).toString("base64")).ok, false);
});

test("pickAgentMode: direct only when all direct tools are present; flags override", () => {
  const full = { DATABASE_URL: "x", DRIVE_BRIDGE_URL: "x", DRIVE_BRIDGE_SECRET: "x", ORACLE_CONVERT_URL: "x" };
  assert.equal(pickAgentMode(full, {}), "direct");
  assert.equal(pickAgentMode({ ...full, ORACLE_CONVERT_URL: undefined }, {}), "api");
  assert.equal(pickAgentMode({ DATABASE_URL: "x" }, {}), "api");
  assert.equal(pickAgentMode(full, { api: true }), "api");
  assert.equal(pickAgentMode({}, { direct: true }), "direct");
});

test("agentApiBase: https only (localhost http allowed), trailing slash trimmed", () => {
  assert.equal(agentApiBase({ AGENT_API_URL: "https://bagrut-materials.vercel.app/" }), "https://bagrut-materials.vercel.app");
  assert.equal(agentApiBase({ NEXT_PUBLIC_SITE_URL: "https://example.org" }), "https://example.org");
  assert.equal(agentApiBase({ AGENT_API_URL: "http://localhost:3000" }), "http://localhost:3000");
  assert.equal(agentApiBase({ AGENT_API_URL: "http://evil.example" }), null);
  assert.equal(agentApiBase({}), null);
});
