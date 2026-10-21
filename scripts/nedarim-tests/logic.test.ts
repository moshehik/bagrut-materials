/**
 * בדיקות הלוגיקה הטהורה של התשלום דרך נדרים פלוס (בלי DB, בלי רשת).
 * הרצה: npx tsx --test scripts/nedarim-tests/logic.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agorotToAmountString,
  buildFinishTransactionValue,
  decideSettlement,
  extractReference,
  extractTransactionFields,
  generateReference,
  isTransactionOk,
  isValidReference,
  matchHistoryRow,
  parseCallbackBody,
  shekelsToAgorot,
} from "../../src/lib/nedarim/logic";

const seq = (n: number) => Uint8Array.from({ length: n }, (_, i) => i * 7 + 3);

test("reference: format, validation, extraction from text", () => {
  const ref = generateReference(seq);
  assert.ok(isValidReference(ref), ref);
  assert.equal(ref.length, 11);
  assert.ok(!/[IO01]/.test(ref.slice(3)), "no confusable characters");
  assert.equal(extractReference(`לו״ז העניין - מנוי שנתי - ${ref}`), ref);
  assert.equal(extractReference(ref.toLowerCase()), ref);
  assert.equal(extractReference("nothing here"), null);
  assert.equal(isValidReference("GP-ABCDEFGH"), false);
});

test("amount conversions", () => {
  assert.equal(agorotToAmountString(58800), "588");
  assert.equal(agorotToAmountString(12990), "129.9");
  assert.equal(agorotToAmountString(12345), "123.45");
  assert.equal(shekelsToAgorot("588"), 58800);
  assert.equal(shekelsToAgorot("588.00 ₪"), 58800);
  assert.equal(shekelsToAgorot(129.9), 12990);
  assert.equal(shekelsToAgorot(""), null);
});

test("FinishTransaction2 value has exactly the official sample fields", () => {
  const v = buildFinishTransactionValue({
    mosad: "1234",
    apiValid: "abc",
    reference: "NP-ABCDEFGH",
    amountAgorot: 58800,
    firstName: "רחל",
    lastName: "כהן",
    phone: "0501234567",
    email: "r@example.com",
    city: "ירושלים",
    comment: "לו״ז העניין - מנוי שנתי - NP-ABCDEFGH",
    callbackUrl: "https://example.com/api/pay/callback?key=s",
    param2: "yearly",
  });
  assert.deepEqual(Object.keys(v).sort(), [
    "Amount", "ApiValid", "CallBack", "CallBackMailError", "City", "Comment", "Currency", "FirstName", "ForceUpdateMatching",
    "Groupe", "LastName", "Mail", "Mosad", "Param1", "Param2", "PaymentType", "Phone", "Street", "Tashlumim", "Zeout",
  ].sort());
  assert.equal(v.Amount, "588");
  assert.equal(v.Param1, "NP-ABCDEFGH");
  assert.equal(v.PaymentType, "Ragil");
  assert.equal(v.Currency, "1");
  assert.equal(v.Tashlumim, "1");
});

test("TransactionResponse ok only on Status OK", () => {
  assert.equal(isTransactionOk({ Status: "OK" }), true);
  assert.equal(isTransactionOk({ Status: "ok " }), true);
  assert.equal(isTransactionOk({ Status: "Error", Message: "x" }), false);
  assert.equal(isTransactionOk({}), false);
  assert.equal(isTransactionOk(null), false);
});

test("callback body parsing: form and json, case-insensitive fields", () => {
  const form = parseCallbackBody("application/x-www-form-urlencoded", "Param1=NP-ABCDEFGH&TransactionId=555&Amount=588&Status=OK&LastNum=1234");
  const f = extractTransactionFields(form);
  assert.equal(f.reference, "NP-ABCDEFGH");
  assert.equal(f.transactionId, "555");
  assert.equal(f.amount, 58800);
  assert.equal(f.ok, true);
  assert.equal(f.last4, "1234");

  const j = parseCallbackBody("application/json", JSON.stringify({ param1: "x", Comments: "מנוי - NP-ABCDEFGH", amount: "129.90" }));
  const g = extractTransactionFields(j);
  assert.equal(g.reference, "NP-ABCDEFGH");
  assert.equal(g.amount, 12990);
  assert.equal(g.ok, null);
  assert.deepEqual(parseCallbackBody(null, ""), {});
});

test("history match: by TransactionId, by comment, amount mismatch", () => {
  const rows = [
    { TransactionId: 1, Amount: "100", Currency: "1", Comments: "other" },
    { TransactionId: 2, Amount: "588", Currency: "1", Comments: "לו״ז העניין - מנוי שנתי - NP-ABCDEFGH" },
  ];
  assert.equal(matchHistoryRow(rows, { transactionId: "2", amountAgorot: 58800, reference: "NP-ABCDEFGH" }).matched, true);
  assert.equal(matchHistoryRow(rows, { transactionId: "2", amountAgorot: 10000, reference: "NP-ABCDEFGH" }).matched, false);
  assert.equal(matchHistoryRow(rows, { transactionId: "9", amountAgorot: 58800, reference: "NP-ABCDEFGH" }).matched, false);
  assert.equal(matchHistoryRow(rows, { transactionId: null, amountAgorot: 58800, reference: "NP-ABCDEFGH" }).matched, true);
  assert.equal(matchHistoryRow(rows, { transactionId: null, amountAgorot: 58800, reference: "NP-ZZZZZZZZ" }).matched, false);
  assert.equal(matchHistoryRow("garbage", { transactionId: null, amountAgorot: 1, reference: "NP-ABCDEFGH" }).matched, false);
});

test("settlement decision: api wins, callback only when trusted, browser report waits", () => {
  const intent = { status: "pending", amount: 58800 };
  assert.equal(decideSettlement({ intent, api: { available: true, matched: true, reason: "" }, report: null }).action, "settle");
  assert.equal(decideSettlement({ intent, api: { available: true, matched: false, reason: "no" }, report: { ok: true, amount: 58800, fromCallback: true } }).action, "wait");
  assert.equal(decideSettlement({ intent, api: { available: false, matched: false, reason: "" }, report: { ok: true, amount: 58800, fromCallback: true } }).action, "wait");
  const trusted = decideSettlement({ intent, api: { available: false, matched: false, reason: "" }, report: { ok: true, amount: 58800, fromCallback: true }, trustCallback: true });
  assert.equal(trusted.action, "settle");
  assert.equal(trusted.verified, false);
  assert.equal(trusted.method, "callback");
  assert.equal(decideSettlement({ intent, api: null, report: { ok: true, amount: 10000, fromCallback: true }, trustCallback: true }).action, "wait");
  assert.equal(decideSettlement({ intent, api: null, report: { ok: true, amount: 58800, fromCallback: false }, trustCallback: true }).action, "wait");
  assert.equal(decideSettlement({ intent, api: null, report: { ok: false, amount: null, fromCallback: false, message: "סירוב" } }).action, "fail");
  assert.equal(decideSettlement({ intent: { status: "paid", amount: 1 }, api: null, report: null }).action, "noop");
  assert.equal(decideSettlement({ intent: { status: "cancelled", amount: 1 }, api: null, report: null, simulated: true }).action, "noop");
  assert.equal(decideSettlement({ intent, api: null, report: null, simulated: true }).method, "simulated");
});
