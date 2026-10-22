/**
 * בדיקות הלוגיקה הטהורה של התשלום דרך נדרים פלוס (בלי DB, בלי רשת). כל הנתונים כאן מומצאים.
 * הרצה: npx tsx --test scripts/nedarim-tests/logic.test.ts scripts/nedarim-tests/secret-crypto.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agorotToAmountString,
  decideAutoMatches,
  extractCallbackFields,
  extractReference,
  findCandidates,
  generateReference,
  hostedPaymentUrl,
  isValidReference,
  parseCallbackBody,
  parseHistoryRow,
  parseNedarimDate,
  phoneDigits,
  shekelsToAgorot,
  type OpenPaymentForMatch,
  type TxForMatch,
} from "../../src/lib/nedarim/logic";

const seq = (n: number) => Uint8Array.from({ length: n }, (_, i) => i * 7 + 3);

test("reference: format, validation, extraction from text", () => {
  const ref = generateReference(seq);
  assert.ok(isValidReference(ref), ref);
  assert.equal(ref.length, 11);
  assert.ok(!/[IO01]/.test(ref.slice(3)), "no confusable characters");
  assert.equal(extractReference(`${ref} | לו״ז העניין - מנוי שנתי - ${ref}`), ref);
  assert.equal(extractReference(ref.toLowerCase()), ref);
  assert.equal(extractReference("nothing here"), null);
  assert.equal(isValidReference("GP-ABCDEFGH"), false);
});

test("amount / phone / date conversions", () => {
  assert.equal(agorotToAmountString(58800), "588");
  assert.equal(agorotToAmountString(12990), "129.9");
  assert.equal(shekelsToAgorot("588.00 ₪"), 58800);
  assert.equal(shekelsToAgorot(""), null);
  assert.equal(phoneDigits("+972-50-123 4567"), "0501234567");
  assert.equal(phoneDigits("050-1234567"), "0501234567");
  assert.equal(phoneDigits("501234567"), "0501234567");
  assert.equal(parseNedarimDate("22/10/2026 14:05")?.getFullYear(), 2026);
  assert.equal(parseNedarimDate("22/10/2026 14:05")?.getMinutes(), 5);
  assert.equal(parseNedarimDate("2026-10-22T11:05:00Z")?.toISOString(), "2026-10-22T11:05:00.000Z");
  assert.equal(parseNedarimDate("garbage"), null);
});

test("hosted payment URL uses only the documented/verified parameters", () => {
  const url = hostedPaymentUrl({
    mosadId: "7019454",
    amountAgorot: 58800,
    reference: "NP-ABCDEFGH",
    clientName: "רחל כהן",
    phone: "0501234567",
    email: "r@example.com",
    comment: "לו״ז העניין - מנוי שנתי - NP-ABCDEFGH",
    redirectUrl: "https://example.com/pay?ref=NP-ABCDEFGH",
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://www.matara.pro/nedarimplus/online/");
  assert.deepEqual([...u.searchParams.keys()].sort(), ["Amount", "AmountLock", "Analytic", "ClientName", "Email", "HideParameters", "OnlyNormal", "OnlyShekel", "Payment", "PaymentLock", "Phone", "Redirect", "comment", "mosad"].sort());
  assert.equal(u.searchParams.get("mosad"), "7019454");
  assert.equal(u.searchParams.get("Amount"), "588");
  assert.equal(u.searchParams.get("AmountLock"), "1");
  assert.equal(u.searchParams.get("Payment"), "1");
  assert.equal(u.searchParams.get("Analytic"), "NP-ABCDEFGH");
  assert.ok(u.searchParams.get("comment")!.includes("NP-ABCDEFGH"));
  assert.equal(u.searchParams.get("Redirect"), "https://example.com/pay?ref=NP-ABCDEFGH");
});

test("history row parsing: documented field names, tolerant", () => {
  const t = parseHistoryRow({ TransactionId: 123456, Amount: "588", Currency: "1", Phone: "050-1234567", Mail: "R@Example.com", Comments: "NP-ABCDEFGH | לו״ז העניין", TransactionTime: "22/10/2026 14:05", Confirmation: "0012345", LastNum: "4321" });
  assert.ok(t);
  assert.equal(t.transactionId, "123456");
  assert.equal(t.amount, 58800);
  assert.equal(t.phone, "0501234567");
  assert.equal(t.email, "r@example.com");
  assert.equal(t.last4, "4321");
  assert.equal(t.transactionAt?.getHours(), 14);
  assert.equal(parseHistoryRow({ Amount: "5" }), null, "no id");
  assert.equal(parseHistoryRow({ TransactionId: "abc", Amount: "5" }), null, "non-numeric id");
  assert.equal(parseHistoryRow(null), null);
});

const now = new Date("2026-10-22T12:00:00Z");
const createdAt = new Date(now.getTime() - 10 * 60 * 1000);
const mkPayment = (o: Partial<OpenPaymentForMatch> = {}): OpenPaymentForMatch => ({ id: 1, reference: "NP-ABCDEFGH", amount: 58800, phone: "0501234567", email: "r@example.com", createdAt, ...o });
const mkTx = (o: Partial<TxForMatch> = {}): TxForMatch => ({
  transactionId: "100", amount: 58800, currency: "1", phone: "", email: "", clientName: null, comments: null, confirmation: null, last4: null,
  transactionAt: now, fetchedAt: now, matchedPaymentId: null, ...o,
});

test("findCandidates: amount exact, ILS, time window, unmatched; strong vs weak", () => {
  const p = mkPayment();
  const strong = mkTx({ transactionId: "1", comments: "NP-ABCDEFGH | מנוי" });
  const weakPhone = mkTx({ transactionId: "2", phone: "0501234567" });
  const weakMail = mkTx({ transactionId: "3", email: "r@example.com" });
  const wrongAmount = mkTx({ transactionId: "4", comments: "NP-ABCDEFGH", amount: 58700 });
  const partial = mkTx({ transactionId: "5", phone: "0501234567", amount: 29400 });
  const usd = mkTx({ transactionId: "6", comments: "NP-ABCDEFGH", currency: "2" });
  const tooOld = mkTx({ transactionId: "7", comments: "NP-ABCDEFGH", transactionAt: new Date(createdAt.getTime() - 60 * 60 * 1000) });
  const taken = mkTx({ transactionId: "8", comments: "NP-ABCDEFGH", matchedPaymentId: 99 });
  const refund = mkTx({ transactionId: "9", comments: "זיכוי NP-ABCDEFGH", amount: -58800 });
  const cancelled = mkTx({ transactionId: "10", comments: "NP-ABCDEFGH", amount: 0 });
  const stranger = mkTx({ transactionId: "11", phone: "0529999999" });
  const noTime = mkTx({ transactionId: "12", comments: "NP-ABCDEFGH", transactionAt: null, fetchedAt: now });
  const c = findCandidates(p, [strong, weakPhone, weakMail, wrongAmount, partial, usd, tooOld, taken, refund, cancelled, stranger, noTime]);
  assert.deepEqual(c.strong.map((t) => t.transactionId), ["1", "12"]);
  assert.deepEqual(c.weak.map((t) => t.transactionId), ["2", "3"]);
});

test("decideAutoMatches: strong unique → match; multiple strong → ambiguous", () => {
  const p = mkPayment();
  const one = decideAutoMatches([p], [mkTx({ transactionId: "1", comments: "NP-ABCDEFGH" }), mkTx({ transactionId: "2", phone: "0501234567" })]);
  assert.equal(one.matches.length, 1);
  assert.equal(one.matches[0].tx.transactionId, "1");
  assert.equal(one.matches[0].kind, "strong");
  assert.equal(one.ambiguous.length, 0);
  const two = decideAutoMatches([p], [mkTx({ transactionId: "1", comments: "NP-ABCDEFGH" }), mkTx({ transactionId: "2", comments: "NP-ABCDEFGH" })]);
  assert.equal(two.matches.length, 0);
  assert.equal(two.ambiguous.length, 1);
});

test("decideAutoMatches: weak only when exactly one tx ↔ exactly one payment", () => {
  const p = mkPayment();
  const ok = decideAutoMatches([p], [mkTx({ transactionId: "2", phone: "0501234567" })]);
  assert.equal(ok.matches.length, 1);
  assert.equal(ok.matches[0].kind, "weak");
  // שתי עסקאות בסכום הזה מאותו טלפון → ספק
  const twoTx = decideAutoMatches([p], [mkTx({ transactionId: "2", phone: "0501234567" }), mkTx({ transactionId: "3", email: "r@example.com" })]);
  assert.equal(twoTx.matches.length, 0);
  assert.equal(twoTx.ambiguous.length, 1);
  // שתי בקשות פתוחות של אותה מורה (אותו טלפון, אותו סכום) ועסקה אחת → ספק, אף אחת לא נתפסת
  const p2 = mkPayment({ id: 2, reference: "NP-ZZZZZZZZ" });
  const twoPayments = decideAutoMatches([p, p2], [mkTx({ transactionId: "2", phone: "0501234567" })]);
  assert.equal(twoPayments.matches.length, 0);
  assert.equal(twoPayments.ambiguous.length, 2);
  // עסקה של מישהי אחרת באותו סכום – לא נתפסת
  const other = decideAutoMatches([p], [mkTx({ transactionId: "5", phone: "0529999999", email: "x@y.com" })]);
  assert.equal(other.matches.length, 0);
  assert.equal(other.ambiguous.length, 0);
  // אותה עסקה לא מוקצית לשתי בקשות (strong ל-p, weak ל-p2 עם אותו טלפון)
  const shared = decideAutoMatches([p, p2], [mkTx({ transactionId: "7", comments: "NP-ABCDEFGH", phone: "0501234567" })]);
  assert.equal(shared.matches.length, 1);
  assert.equal(shared.matches[0].paymentId, 1);
});

test("callback body parsing (optional webhook)", () => {
  const form = parseCallbackBody("application/x-www-form-urlencoded", "Param1=NP-ABCDEFGH&TransactionId=555&Amount=588");
  const f = extractCallbackFields(form);
  assert.equal(f.reference, "NP-ABCDEFGH");
  assert.equal(f.transactionId, "555");
  assert.equal(f.amount, 58800);
  const j = extractCallbackFields(parseCallbackBody("application/json", JSON.stringify({ Comments: "מנוי - NP-ABCDEFGH" })));
  assert.equal(j.reference, "NP-ABCDEFGH");
  assert.deepEqual(parseCallbackBody(null, ""), {});
});
