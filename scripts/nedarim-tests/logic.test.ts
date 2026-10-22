/**
 * בדיקות הלוגיקה הטהורה של התשלום דרך נדרים פלוס (בלי DB, בלי רשת). כל הנתונים כאן מומצאים.
 * הרצה (עם TZ=UTC כדי לוודא שפענוח התאריכים לא תלוי בשעון השרת):
 *   TZ=UTC npx tsx --test scripts/nedarim-tests/logic.test.ts scripts/nedarim-tests/secret-crypto.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceLastId,
  agorotToAmountString,
  checkManualTransaction,
  chunk,
  customerStatusText,
  decideAutoMatches,
  isStaleProcessing,
  needsPurchaseRepair,
  normalizeConfirmation,
  sameIntentParams,
  extractCallbackFields,
  extractReference,
  findCandidates,
  generateReference,
  hostedPaymentUrl,
  isApprovedTx,
  isValidReference,
  parseCallbackBody,
  parseHistoryRow,
  parseNedarimDate,
  phoneDigits,
  pickRawFields,
  settlementPlan,
  shekelsToAgorot,
  transactionStatusOk,
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

test("amount / phone conversions", () => {
  assert.equal(agorotToAmountString(58800), "588");
  assert.equal(agorotToAmountString(12990), "129.9");
  assert.equal(shekelsToAgorot("588.00 ₪"), 58800);
  assert.equal(shekelsToAgorot(""), null);
  assert.equal(phoneDigits("+972-50-123 4567"), "0501234567");
  assert.equal(phoneDigits("050-1234567"), "0501234567");
  assert.equal(phoneDigits("501234567"), "0501234567");
});

test("M4: dates without offset are Asia/Jerusalem regardless of server TZ (DST aware)", () => {
  const ref = new Date("2026-11-01T00:00:00Z"); // "עכשיו" קבוע – כל התאריכים בבדיקה בעבר ביחס אליו
  // 22.10.2026 – שעון קיץ (IDT, UTC+3; מסתיים 25.10.2026)
  assert.equal(parseNedarimDate("22/10/2026 14:05", ref)?.toISOString(), "2026-10-22T11:05:00.000Z");
  // 22.01.2026 – שעון חורף (IST, UTC+2)
  assert.equal(parseNedarimDate("22/01/2026 14:05:30", ref)?.toISOString(), "2026-01-22T12:05:30.000Z");
  // ISO בלי offset – גם שעת ירושלים
  assert.equal(parseNedarimDate("2026-10-22T14:05:00", ref)?.toISOString(), "2026-10-22T11:05:00.000Z");
  assert.equal(parseNedarimDate("2026-01-22 14:05", ref)?.toISOString(), "2026-01-22T12:05:00.000Z");
  // ISO עם Z – כפי שהוא
  assert.equal(parseNedarimDate("2026-10-22T11:05:00Z", ref)?.toISOString(), "2026-10-22T11:05:00.000Z");
  // גבול DST (25.10.2026 02:00 → 01:00): 00:30 עדיין UTC+3; 03:30 כבר UTC+2 (השעה 01:00–02:00 כפולה – לא נבדקת)
  assert.equal(parseNedarimDate("25/10/2026 00:30", ref)?.toISOString(), "2026-10-24T21:30:00.000Z");
  assert.equal(parseNedarimDate("25/10/2026 03:30", ref)?.toISOString(), "2026-10-25T01:30:00.000Z");
  assert.equal(parseNedarimDate("garbage", ref), null);
  assert.equal(parseNedarimDate("", ref), null);
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

test("history row parsing: documented field names, approval, raw whitelist (M6)", () => {
  const row = { TransactionId: 123456, Amount: "588", Currency: "1", Phone: "050-1234567", Mail: "R@Example.com", Comments: "NP-ABCDEFGH | לו״ז העניין", TransactionTime: "22/10/2026 14:05", Confirmation: "0012345", LastNum: "4321", Zeout: "123456789", Adresse: "רחוב 1", ClientName: "רחל" };
  const t = parseHistoryRow(row);
  assert.ok(t);
  assert.equal(t.transactionId, "123456");
  assert.equal(t.amount, 58800);
  assert.equal(t.phone, "0501234567");
  assert.equal(t.email, "r@example.com");
  assert.equal(t.last4, "4321");
  assert.equal(t.approved, true);
  assert.equal(t.transactionAt?.toISOString(), "2026-10-22T11:05:00.000Z");
  const raw = pickRawFields(row);
  assert.ok(!("Zeout" in raw) && !("Adresse" in raw) && !("ClientName" in raw) && !("Phone" in raw) && !("Mail" in raw));
  assert.equal(raw.Confirmation, "0012345");
  assert.equal(parseHistoryRow({ Amount: "5" }), null, "no id");
  assert.equal(parseHistoryRow({ TransactionId: "abc", Amount: "5" }), null, "non-numeric id");
  assert.equal(parseHistoryRow(null), null);
});

test("H1: approval requires a confirmation number and no failure status; unknown status = not approved", () => {
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588" })!.approved, false, "no confirmation");
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "  " })!.approved, false, "blank confirmation");
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "123" })!.approved, true);
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "123", Status: "Error" })!.approved, false);
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "123", Status: "סירוב" })!.approved, false);
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "123", Status: "ממתין" })!.approved, false);
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "123", Status: "OK" })!.approved, true);
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "123", Status: "אושר" })!.approved, true);
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "123", Status: "whatever" })!.approved, false, "unknown status is fail-safe");
  assert.equal(transactionStatusOk(null), null);
  assert.equal(transactionStatusOk("Success"), true);
  assert.equal(isApprovedTx({ confirmation: "1", status: null }), true);
});

const now = new Date("2026-10-22T12:00:00Z");
const createdAt = new Date(now.getTime() - 10 * 60 * 1000);
const mkPayment = (o: Partial<OpenPaymentForMatch> = {}): OpenPaymentForMatch => ({ id: 1, reference: "NP-ABCDEFGH", amount: 58800, phone: "0501234567", email: "r@example.com", createdAt, ...o });
const mkTx = (o: Partial<TxForMatch> = {}): TxForMatch => ({
  transactionId: "100", amount: 58800, currency: "1", phone: "", email: "", clientName: null, comments: null, confirmation: "0012345", last4: null,
  status: null, approved: true, transactionAt: now, fetchedAt: now, matchedPaymentId: null, ...o,
});

test("findCandidates: approved + amount exact + ILS + dated + window + unmatched; strong vs weak", () => {
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
  const noTime = mkTx({ transactionId: "12", comments: "NP-ABCDEFGH", transactionAt: null }); // M3
  const notApproved = mkTx({ transactionId: "13", comments: "NP-ABCDEFGH", approved: false, confirmation: null }); // H1
  const c = findCandidates(p, [strong, weakPhone, weakMail, wrongAmount, partial, usd, tooOld, taken, refund, cancelled, stranger, noTime, notApproved]);
  assert.deepEqual(c.strong.map((t) => t.transactionId), ["1"]);
  assert.deepEqual(c.weak.map((t) => t.transactionId), ["2", "3"]);
});

test("M3: cutoff excludes historical transactions even inside the payment window", () => {
  const p = mkPayment();
  const tx = mkTx({ transactionId: "1", comments: "NP-ABCDEFGH", transactionAt: new Date(createdAt.getTime() - 5 * 60 * 1000) });
  assert.equal(findCandidates(p, [tx], null).strong.length, 1, "inside grace window");
  assert.equal(findCandidates(p, [tx], createdAt).strong.length, 0, "before cutoff");
  assert.equal(findCandidates(p, [tx], new Date(createdAt.getTime() - 10 * 60 * 1000)).strong.length, 1, "after cutoff");
});

test("decideAutoMatches: only a unique strong match settles; multiple strong → review", () => {
  const p = mkPayment();
  const one = decideAutoMatches([p], [mkTx({ transactionId: "1", comments: "NP-ABCDEFGH" }), mkTx({ transactionId: "2", phone: "0501234567" })]);
  assert.equal(one.matches.length, 1);
  assert.equal(one.matches[0].tx.transactionId, "1");
  assert.equal(one.review.length, 0);
  const two = decideAutoMatches([p], [mkTx({ transactionId: "1", comments: "NP-ABCDEFGH" }), mkTx({ transactionId: "2", comments: "NP-ABCDEFGH" })]);
  assert.equal(two.matches.length, 0);
  assert.equal(two.review.length, 1);
  assert.deepEqual(two.review[0].transactionIds, ["1", "2"]);
});

test("L4: weak (phone/email only) never settles automatically – goes to manual review with the candidate ids", () => {
  const p = mkPayment();
  const weak = decideAutoMatches([p], [mkTx({ transactionId: "2", phone: "0501234567" })]);
  assert.equal(weak.matches.length, 0);
  assert.equal(weak.review.length, 1);
  assert.deepEqual(weak.review[0].transactionIds, ["2"]);
  // עסקה של מישהי אחרת באותו סכום – לא מועמדת כלל (לא review)
  const other = decideAutoMatches([p], [mkTx({ transactionId: "5", phone: "0529999999", email: "x@y.com" })]);
  assert.equal(other.matches.length, 0);
  assert.equal(other.review.length, 0);
  // אותה עסקה strong לשתי בקשות (לא אמור לקרות) – אף אחת לא נתפסת, שתיהן ל-review
  const p2 = mkPayment({ id: 2, reference: "NP-ABCDEFGH" });
  const shared = decideAutoMatches([p, p2], [mkTx({ transactionId: "7", comments: "NP-ABCDEFGH" })]);
  assert.equal(shared.matches.length, 0);
  assert.equal(shared.review.length, 2);
});

test("M1: manual settle with a cached transaction requires approved, exact amount, positive, ILS", () => {
  const intent = { amount: 58800 };
  assert.equal(checkManualTransaction(intent, { amount: 58800, currency: "1", approved: true, confirmation: "1" }).ok, true);
  assert.equal(checkManualTransaction(intent, { amount: 58700, currency: "1", approved: true, confirmation: "1" }).ok, false, "amount mismatch");
  assert.equal(checkManualTransaction(intent, { amount: 29400, currency: "1", approved: true, confirmation: "1" }).ok, false, "partial");
  assert.equal(checkManualTransaction(intent, { amount: -58800, currency: "1", approved: true, confirmation: "1" }).ok, false, "negative");
  assert.equal(checkManualTransaction(intent, { amount: 0, currency: "1", approved: true, confirmation: "1" }).ok, false, "zero");
  assert.equal(checkManualTransaction(intent, { amount: 58800, currency: "2", approved: true, confirmation: "1" }).ok, false, "USD");
  assert.equal(checkManualTransaction(intent, { amount: 58800, currency: "1", approved: false, confirmation: null }).ok, false, "not approved");
  assert.ok(checkManualTransaction(intent, { amount: 58700, currency: "1", approved: true, confirmation: "1" }).reason.includes("587"));
});

test("M2/M5: settlement plan – coupon must be claimed first; existing purchases are never inserted twice", () => {
  assert.equal(settlementPlan({ hasCoupon: true, couponClaimed: false, existingPurchaseId: null }), "wait_coupon");
  assert.equal(settlementPlan({ hasCoupon: true, couponClaimed: true, existingPurchaseId: null }), "insert");
  assert.equal(settlementPlan({ hasCoupon: false, couponClaimed: false, existingPurchaseId: null }), "insert");
  assert.equal(settlementPlan({ hasCoupon: false, couponClaimed: false, existingPurchaseId: 42 }), "skip_insert");
  assert.equal(settlementPlan({ hasCoupon: true, couponClaimed: true, existingPurchaseId: 42 }), "skip_insert");
  // שחזור אחרי כשל מאוחר: קופון כבר נתפס לבקשה הזו + purchases קיימים → רק סימון paid
  assert.equal(settlementPlan({ hasCoupon: true, couponClaimed: true, existingPurchaseId: 7 }), "skip_insert");
});

test("N3: confirmation normalization – every 'empty' spelling is not approved", () => {
  for (const v of [undefined, null, false, "", "   ", "0", "00", "000", "false", "null", "undefined", "N/A", "n/a", "na", "none", "-", "--", "—", "–"]) {
    assert.equal(normalizeConfirmation(v), null, `value ${JSON.stringify(v)}`);
    assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: v })!.approved, false, `approved for ${JSON.stringify(v)}`);
  }
  assert.equal(normalizeConfirmation(" 0012345 "), "0012345");
  assert.equal(normalizeConfirmation("AB12"), "AB12");
  assert.equal(normalizeConfirmation("x".repeat(60))!.length, 40);
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: 7 })!.approved, true);
});

test("N4: date ranges, round-trip, no MM/dd guessing, future rejection, ASP.NET /Date()/", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  assert.equal(parseNedarimDate("31/02/2026 10:00", now), null, "round-trip fails");
  assert.equal(parseNedarimDate("00/10/2026 10:00", now), null);
  assert.equal(parseNedarimDate("22/13/2026 10:00", now), null, "month 13");
  assert.equal(parseNedarimDate("22/10/2026 24:00", now), null, "hour 24");
  assert.equal(parseNedarimDate("22/10/2026 10:60", now), null, "minute 60");
  assert.equal(parseNedarimDate("10/22/2026 10:00", now), null, "MM/dd is not guessed");
  assert.equal(parseNedarimDate("2026-02-31 10:00", now), null);
  assert.equal(parseNedarimDate("05/10/2026 10:00", now)?.toISOString(), "2026-10-05T07:00:00.000Z", "valid dd/MM stays dd/MM");
  assert.equal(parseNedarimDate("24/10/2026 10:00", now), null, "more than a day in the future");
  assert.equal(parseNedarimDate("23/10/2026 10:00", now)?.toISOString(), "2026-10-23T07:00:00.000Z", "within a day ahead is fine");
  const epoch = Date.UTC(2026, 9, 22, 11, 5, 0); // 2026-10-22T11:05:00Z
  assert.equal(parseNedarimDate(`/Date(${epoch})/`, now)?.toISOString(), "2026-10-22T11:05:00.000Z");
  assert.equal(parseNedarimDate(`/Date(${epoch}+0300)/`, now)?.toISOString(), "2026-10-22T11:05:00.000Z");
  assert.equal(parseNedarimDate("/Date(1900000000000)/", now), null, "future epoch");
  assert.equal(parseNedarimDate("01/01/1999 10:00", now), null, "before 2000");
  assert.equal(parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "1", TransactionTime: "10/22/2026 10:00" }, now)!.transactionAt, null);
});

test("N5: values are clamped to column widths; N1: chunking and lastId never advances past a failed row", () => {
  const t = parseHistoryRow({ TransactionId: 1, Amount: "588", Confirmation: "1", Mail: "a".repeat(300) + "@x.com", Currency: "ILS-NIS", ClientName: "x".repeat(200), Status: "y".repeat(50) })!;
  assert.equal(t.email.length, 255);
  assert.equal(t.currency!.length, 4);
  assert.equal(t.clientName!.length, 120);
  assert.equal(t.status!.length, 30);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
  const ids = ["101", "102", "103", "104"];
  assert.equal(advanceLastId(ids, -1, 100), 104, "all saved");
  assert.equal(advanceLastId(ids, 2, 100), 102, "row index 2 failed → stop at 102");
  assert.equal(advanceLastId(ids, 0, 100), 100, "first row failed → no advance");
  assert.equal(advanceLastId(ids, 0, null), null);
  assert.equal(advanceLastId(["5", "x", "7"], -1, null), 7, "non-numeric ids ignored");
  assert.equal(advanceLastId(["3"], -1, 10), 10, "never goes backwards");
});

test("N2: same coupon reuses only an identical order", () => {
  const a = { plan: "yearly", categoryIds: [3, 1], subjectsPending: false, amount: 50000 };
  assert.equal(sameIntentParams(a, { plan: "yearly", categoryIds: [1, 3, 3], subjectsPending: false, amount: 50000 }), true, "order/dupes ignored");
  assert.equal(sameIntentParams(a, { ...a, categoryIds: [1] }), false);
  assert.equal(sameIntentParams(a, { ...a, plan: "substitute_3m" }), false);
  assert.equal(sameIntentParams(a, { ...a, amount: 49900 }), false);
  assert.equal(sameIntentParams(a, { ...a, subjectsPending: true }), false);
});

test("N7/N10: repair detection and stale processing", () => {
  assert.equal(needsPurchaseRepair("paid", null, false), true);
  assert.equal(needsPurchaseRepair("paid", 5, false), false);
  assert.equal(needsPurchaseRepair("paid", null, true), false, "exists by payment_ref");
  assert.equal(needsPurchaseRepair("processing", null, false), false);
  const now = new Date("2026-10-22T12:00:00Z");
  assert.equal(isStaleProcessing("processing", new Date("2026-10-20T11:00:00Z"), now), true);
  assert.equal(isStaleProcessing("processing", new Date("2026-10-21T13:00:00Z"), now), false);
  assert.equal(isStaleProcessing("pending", new Date("2026-10-01T00:00:00Z"), now), false);
  assert.ok(customerStatusText("processing", false, true).includes("יותר מיומיים"));
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
