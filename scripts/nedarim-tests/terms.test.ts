import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkKevaRecord,
  checkManualTransaction,
  checkTxTerms,
  chargeTermsFor,
  decideAutoMatches,
  describeTerms,
  findCandidates,
  hostedPaymentUrl,
  parseHistoryRow,
  parseKevaRecord,
  sameIntentParams,
  termsOfPayment,
  txTermsFromRaw,
  type OpenPaymentForMatch,
  type TxForMatch,
} from "../../src/lib/nedarim/logic";

/** תנאי תשלום: שנתי = 12 תשלומים; ממלאת מקום 3 חודשים = 3 תשלומים; הוראת קבע (בלי תפיסת מסגרת) – סכומים נעולים ונבדקים מול העסקה שנדרים מחזירים */

const now = new Date("2026-10-28T12:00:00Z");
const createdAt = new Date(now.getTime() - 10 * 60 * 1000);
const mkPayment = (o: Partial<OpenPaymentForMatch> = {}): OpenPaymentForMatch => ({ id: 1, reference: "NP-ABCDEFGH", amount: 58800, phone: "0501234567", email: "r@example.com", createdAt, ...o });
const mkTx = (o: Partial<TxForMatch> = {}): TxForMatch => ({
  transactionId: "100", amount: 58800, currency: "1", phone: "", email: "", clientName: null, comments: "NP-ABCDEFGH | x", confirmation: "0012345", last4: null,
  status: null, approved: true, transactionAt: now, fetchedAt: now, matchedPaymentId: null, installments: 1, txType: "רגיל", kevaId: null, ...o,
});

test("chargeTermsFor: שנתי = 12 תשלומים, ממלאת מקום 3 חודשים = 3 תשלומים, יומית/פריט = תשלום אחד", () => {
  assert.deepEqual(chargeTermsFor("yearly", "normal", 58800), { mode: "normal", installments: 12, chargeAmount: 58800, total: 58800 });
  assert.deepEqual(chargeTermsFor("substitute_3m", "normal", 39000), { mode: "normal", installments: 3, chargeAmount: 39000, total: 39000 });
  assert.equal(chargeTermsFor("substitute_daily", "normal", 16000)?.installments, 1);
  assert.equal(chargeTermsFor("single", "normal", 790)?.installments, 1);
  assert.equal(chargeTermsFor("bundle", "normal", 4200)?.installments, 1);
  // סכום קטן מכדי לפצל (<5 ₪ לתשלום) → תשלום אחד
  assert.equal(chargeTermsFor("substitute_3m", "normal", 1200)?.installments, 1);
  assert.equal(chargeTermsFor("yearly", "normal", 0), null);
});

test("chargeTermsFor: הוראת קבע רק למסלולים שמגדירים ורק כשהסכום מתחלק בשווה באגורות וכל חיוב ≥ 5 ₪", () => {
  assert.deepEqual(chargeTermsFor("yearly", "keva", 58800), { mode: "keva", installments: 12, chargeAmount: 4900, total: 58800 });
  assert.deepEqual(chargeTermsFor("substitute_3m", "keva", 39000), { mode: "keva", installments: 3, chargeAmount: 13000, total: 39000 });
  // עם קופון 10% – עדיין מתחלק
  assert.equal(chargeTermsFor("yearly", "keva", 52920)?.chargeAmount, 4410);
  // לא מתחלק → אין הו"ק (אין עיגול – הסכום נעול)
  assert.equal(chargeTermsFor("yearly", "keva", 58801), null);
  assert.equal(chargeTermsFor("substitute_3m", "keva", 39001), null);
  // מתחת למינימום לכל חיוב
  assert.equal(chargeTermsFor("yearly", "keva", 12 * 499), null);
  // אין הו"ק ליומית ולפריטים
  for (const k of ["substitute_daily", "single", "bundle"]) assert.equal(chargeTermsFor(k, "keva", 60000), null, k);
  assert.equal(describeTerms(chargeTermsFor("yearly", "keva", 58800)!), "הוראת קבע – 12 חיובים חודשיים של ₪49");
  assert.equal(describeTerms(chargeTermsFor("substitute_3m", "normal", 39000)!), "3 תשלומים");
  assert.equal(describeTerms(chargeTermsFor("yearly", "normal", 58800)!), "12 תשלומים");
  assert.equal(describeTerms(chargeTermsFor("single", "normal", 790)!), "תשלום אחד");
});

test("termsOfPayment: בקשות ישנות (בלי העמודות) = תשלום אחד בסכום המלא", () => {
  assert.deepEqual(termsOfPayment({ amount: 58800 }), { mode: "normal", installments: 1, chargeAmount: 58800, total: 58800 });
  assert.deepEqual(termsOfPayment({ amount: 58800, chargeMode: "keva", installments: 12, chargeAmount: 4900 }), { mode: "keva", installments: 12, chargeAmount: 4900, total: 58800 });
  // חסר charge_amount בהו"ק → נגזר (לא נופלים על הסכום הכולל)
  assert.equal(termsOfPayment({ amount: 58800, chargeMode: "keva", installments: 12, chargeAmount: null }).chargeAmount, 4900);
});

test("hostedPaymentUrl: שנתי – Payment=12 נעול; 3 חודשים – Payment=3 נעול; הסכום נעול בשני המקרים", () => {
  const base = { mosadId: "7019454", reference: "NP-ABCDEFGH", clientName: "", phone: "", email: "", description: "", redirectUrl: "" };
  const y = new URL(hostedPaymentUrl({ ...base, amountAgorot: 58800, planKey: "yearly", mode: "normal", installments: 12 }));
  assert.equal(y.searchParams.get("Amount"), "588", "בעסקה רגילה Amount הוא הסכום המלא");
  assert.equal(y.searchParams.get("Payment"), "12");
  assert.equal(y.searchParams.get("PaymentLock"), "1");
  assert.equal(y.searchParams.get("AmountLock"), "1");
  assert.equal(y.searchParams.get("OnlyNormal"), "1");
  assert.equal(y.searchParams.has("OnlyKeva"), false);
  const s3 = new URL(hostedPaymentUrl({ ...base, amountAgorot: 39000, planKey: "substitute_3m", mode: "normal", installments: 3 }));
  assert.equal(s3.searchParams.get("Amount"), "390", "בעסקה רגילה Amount הוא הסכום המלא");
  assert.equal(s3.searchParams.get("Payment"), "3");
  assert.equal(s3.searchParams.get("PaymentLock"), "1");
  assert.equal(s3.searchParams.get("groupe"), "ממלאת מקום 3 חודשים");
});

test("hostedPaymentUrl: הוראת קבע – OnlyKeva, Amount = החיוב החודשי, Payment = מספר החודשים, הכול נעול, קטגוריה נפרדת (בלי מינימום המסלול)", () => {
  const base = { mosadId: "7019454", reference: "NP-ABCDEFGH", clientName: "", phone: "", email: "", description: "", redirectUrl: "" };
  const k = new URL(hostedPaymentUrl({ ...base, amountAgorot: 58800, planKey: "yearly", mode: "keva", installments: 12, chargeAgorot: 4900 }));
  assert.equal(k.searchParams.get("OnlyKeva"), "1");
  assert.equal(k.searchParams.has("OnlyNormal"), false);
  assert.equal(k.searchParams.get("Amount"), "49");
  assert.equal(k.searchParams.get("AmountLock"), "1");
  assert.equal(k.searchParams.get("Payment"), "12");
  assert.equal(k.searchParams.get("PaymentLock"), "1");
  assert.equal(k.searchParams.get("Analytic"), "NP-ABCDEFGH");
  assert.equal(k.searchParams.get("groupe"), "מנוי שנתי – הוראת קבע", "לא 'מנוי שנתי' – שם לקטגוריה יש Amount מינימלי של 588");
  assert.equal(new URL(hostedPaymentUrl({ ...base, amountAgorot: 39000, planKey: "substitute_3m", mode: "keva", installments: 3, chargeAgorot: 13000 })).searchParams.get("Amount"), "130");
  // ללא פרמטרים חדשים – ההתנהגות הישנה (תשלום אחד)
  const legacy = new URL(hostedPaymentUrl({ ...base, amountAgorot: 58800, planKey: "yearly" }));
  assert.equal(legacy.searchParams.get("Payment"), "1");
  assert.equal(legacy.searchParams.get("OnlyNormal"), "1");
});

test("parseHistoryRow / txTermsFromRaw: Tashloumim, TransactionType, KevaId נקראים (ונשמרים ב-raw)", () => {
  const row = { TransactionId: 5, Amount: "390", Currency: "1", Confirmation: "123", Comments: "NP-ABCDEFGH", TransactionTime: "28/10/2026 10:00:00", Tashloumim: "3", TransactionType: "תשלומים" };
  const t = parseHistoryRow(row, now)!;
  assert.equal(t.installments, 3);
  assert.equal(t.txType, "תשלומים");
  assert.equal(t.kevaId, null);
  const keva = parseHistoryRow({ ...row, Amount: "49", TransactionType: "הוראת קבע", Tashloumim: "", KevaId: "777" }, now)!;
  assert.equal(keva.kevaId, "777");
  assert.equal(keva.installments, null);
  assert.deepEqual(txTermsFromRaw(JSON.stringify({ Tashloumim: "12", TransactionType: "רגיל", KevaId: "9" })), { installments: 12, txType: "רגיל", kevaId: "9" });
  assert.deepEqual(txTermsFromRaw("not json"), { installments: null, txType: null, kevaId: null });
  assert.deepEqual(txTermsFromRaw(null), { installments: null, txType: null, kevaId: null });
});

test("checkTxTerms: שנתי – בדיוק 12 תשלומים בסכום המלא; כל סטייה נדחית", () => {
  const terms = chargeTermsFor("yearly", "normal", 58800)!;
  assert.equal(checkTxTerms(terms, mkTx({ installments: 12, txType: "תשלומים" })).ok, true);
  assert.equal(checkTxTerms(terms, mkTx({ installments: null })).ok, false, "בלי Tashloumim לא ניתן לאמת 12 תשלומים");
  const one = checkTxTerms(terms, mkTx({ installments: 1 }));
  assert.equal(one.ok, false, "תשלום אחד במקום 12");
  assert.ok(one.reason.includes("12") && one.reason.includes("1"), one.reason);
  assert.equal(checkTxTerms(terms, mkTx({ installments: 6 })).ok, false);
  assert.equal(checkTxTerms(terms, mkTx({ installments: 12, amount: 58700 })).ok, false, "סכום שונה");
  assert.equal(checkTxTerms(terms, mkTx({ amount: 4900, kevaId: "7", txType: "הוראת קבע" })).ok, false);
  assert.equal(checkTxTerms(terms, mkTx({ installments: 12, kevaId: "7" })).ok, false, "הוראת קבע במקום תשלום רגיל");
  assert.equal(checkTxTerms(terms, mkTx({ installments: 12, txType: "הו\"ק" })).ok, false);
  // תשלום אחד בלבד הוא תנאי של יומית/פריט
  assert.equal(checkTxTerms(chargeTermsFor("single", "normal", 790)!, mkTx({ amount: 790, installments: null })).ok, true, "בלי Tashloumim ובקשה לתשלום אחד – מתקבל");
});

test("checkTxTerms: ממלאת מקום 3 חודשים – בדיוק 3 תשלומים; תשלום אחד או 6 נדחים; מספר תשלומים לא ידוע נדחה", () => {
  const terms = chargeTermsFor("substitute_3m", "normal", 39000)!;
  assert.equal(checkTxTerms(terms, mkTx({ amount: 39000, installments: 3, txType: "תשלומים" })).ok, true);
  assert.equal(checkTxTerms(terms, mkTx({ amount: 39000, installments: 1 })).ok, false);
  assert.equal(checkTxTerms(terms, mkTx({ amount: 39000, installments: 6 })).ok, false);
  assert.equal(checkTxTerms(terms, mkTx({ amount: 39000, installments: null })).ok, false, "לא ניתן לאמת");
});

test("checkTxTerms: הוראת קבע – חיוב חודשי של הוראת קבע; חיוב רגיל או סכום מלא נדחים", () => {
  const terms = chargeTermsFor("yearly", "keva", 58800)!;
  assert.equal(checkTxTerms(terms, mkTx({ amount: 4900, kevaId: "777", txType: "הוראת קבע", installments: null })).ok, true);
  assert.equal(checkTxTerms(terms, mkTx({ amount: 4900, txType: "הוראת קבע", installments: null })).ok, true, "סוג עסקה מספיק גם בלי KevaId");
  assert.equal(checkTxTerms(terms, mkTx({ amount: 4900 })).ok, false, "חיוב רגיל בסכום חודשי");
  assert.equal(checkTxTerms(terms, mkTx({ amount: 58800, kevaId: "777" })).ok, false, "הסכום המלא במקום החודשי");
  assert.equal(checkTxTerms(terms, mkTx({ amount: 5000, kevaId: "777" })).ok, false);
});

test("התאמה: עסקה עם מזהה הבקשה שאינה בתנאים → לא משדרגת, עוברת לאישור ידני עם הסיבה", () => {
  const sub3 = mkPayment({ amount: 39000, installments: 3, chargeMode: "normal" });
  const ok = decideAutoMatches([sub3], [mkTx({ amount: 39000, installments: 3, txType: "תשלומים" })]);
  assert.equal(ok.matches.length, 1);
  assert.equal(ok.matches[0].kind, "strong");
  // המורה שינתה את הקישור ושילמה בתשלום אחד
  const tampered = decideAutoMatches([sub3], [mkTx({ transactionId: "55", amount: 39000, installments: 1 })]);
  assert.equal(tampered.matches.length, 0);
  assert.equal(tampered.review.length, 1);
  assert.deepEqual(tampered.review[0].transactionIds, ["55"]);
  assert.ok(tampered.review[0].reason.includes("תשלומים"), tampered.review[0].reason);
  // שנתי (12 תשלומים): ששולם בתשלום אחד – לא משדרג
  const yearly = mkPayment({ installments: 12, chargeMode: "normal" });
  assert.equal(decideAutoMatches([yearly], [mkTx({ installments: 12 })]).matches.length, 1);
  const split = decideAutoMatches([yearly], [mkTx({ transactionId: "56", installments: 1 })]);
  assert.equal(split.matches.length, 0);
  assert.equal(split.review.length, 1);
  // סכום שונה עם מזהה הבקשה (שינוי Amount בקישור) – עד היום נעלם בשקט; עכשיו מוצג לאישור ידני
  const cheaper = decideAutoMatches([yearly], [mkTx({ transactionId: "57", amount: 100, installments: 12 })]);
  assert.equal(cheaper.matches.length, 0);
  assert.equal(cheaper.review.length, 1);
  assert.ok(cheaper.review[0].reason.includes("סכום"), cheaper.review[0].reason);
});

test("התאמה: עסקאות בלי מזהה בקשה בתנאים שגויים אינן מועמדות (גם לא לבדיקה ידנית אוטומטית)", () => {
  const sub3 = mkPayment({ amount: 39000, installments: 3, chargeMode: "normal" });
  const r = decideAutoMatches([sub3], [mkTx({ transactionId: "60", comments: null, phone: "0501234567", amount: 39000, installments: 1 })]);
  assert.equal(r.matches.length, 0);
  assert.equal(r.review.length, 0);
  // וזיכוי / ביטול / USD עם מזהה הבקשה אינם נחשבים "אי-התאמה" (לא מציפים את המנהלת)
  for (const bad of [mkTx({ amount: -58800 }), mkTx({ amount: 0 }), mkTx({ currency: "2" }), mkTx({ approved: false, confirmation: null })]) {
    const x = decideAutoMatches([mkPayment({ installments: 12 })], [bad]);
    assert.equal(x.matches.length + x.review.length, 0);
  }
});

test("התאמה: הוראת קבע – חיוב חודשי עם מזהה הבקשה מותאם; חיוב רגיל באותו סכום חודשי או הסכום המלא לא", () => {
  const keva = mkPayment({ amount: 58800, chargeMode: "keva", installments: 12, chargeAmount: 4900 });
  const good = decideAutoMatches([keva], [mkTx({ transactionId: "70", amount: 4900, kevaId: "777", txType: "הוראת קבע", installments: null })]);
  assert.equal(good.matches.length, 1);
  assert.equal(good.matches[0].tx.kevaId, "777");
  const fullNormal = decideAutoMatches([keva], [mkTx({ transactionId: "71", amount: 58800 })]);
  assert.equal(fullNormal.matches.length, 0);
  assert.equal(fullNormal.review.length, 1);
  const candidates = findCandidates(keva, [mkTx({ transactionId: "72", amount: 4900 })]);
  assert.equal(candidates.strong.length, 0);
  assert.equal(candidates.mismatch.length, 1);
});

test("אישור ידני: אותן בדיקות תנאים (מספר תשלומים, הוראת קבע) – סטייה נדחית אלא אם המנהלת מאשרת חריג", () => {
  const sub3 = { amount: 39000, chargeMode: "normal", installments: 3, chargeAmount: 39000 };
  const base = { currency: "1", approved: true, confirmation: "1" };
  assert.equal(checkManualTransaction(sub3, { ...base, amount: 39000, installments: 3 }).ok, true);
  assert.equal(checkManualTransaction(sub3, { ...base, amount: 39000, installments: 1 }).ok, false);
  assert.equal(checkManualTransaction(sub3, { ...base, amount: 39000, installments: 1 }).reason.includes("תשלומים"), true);
  const keva = { amount: 58800, chargeMode: "keva", installments: 12, chargeAmount: 4900 };
  assert.equal(checkManualTransaction(keva, { ...base, amount: 4900, kevaId: "7" }).ok, true);
  assert.equal(checkManualTransaction(keva, { ...base, amount: 58800 }).ok, false);
  const yearly = { amount: 58800, chargeMode: "normal", installments: 12, chargeAmount: 58800 };
  assert.equal(checkManualTransaction(yearly, { ...base, amount: 58800, installments: 12 }).ok, true);
  assert.equal(checkManualTransaction(yearly, { ...base, amount: 58800, installments: 1 }).ok, false, "שנתי בתשלום אחד – דורש אישור חריג");
  // בקשה רגילה ישנה (בלי העמודות) – כמו קודם
  assert.equal(checkManualTransaction({ amount: 58800 }, { ...base, amount: 58800 }).ok, true);
  assert.equal(checkManualTransaction({ amount: 58800 }, { ...base, amount: 58700 }).ok, false);
});

test("parseKevaRecord + checkKevaRecord: הוראה פעילה, חודשית, בסכום ובמספר החיובים שנקבעו", () => {
  const terms = chargeTermsFor("yearly", "keva", 58800)!;
  const rec = (o: Record<string, unknown> = {}) =>
    parseKevaRecord({ KevaId: "777", KevaStatus: 1, KevaAmount: "49", KevaCurrency: 1, KevaFrequency: 1, KevaTashlumim: 11, KevaSuccess: 1, ...o })!;
  assert.equal(checkKevaRecord(terms, rec()).ok, true);
  assert.equal(checkKevaRecord(terms, rec({ KevaStatus: 2 })).ok, false, "מוקפאת");
  assert.equal(checkKevaRecord(terms, rec({ KevaStatus: 3 })).ok, false, "נמחקה");
  assert.equal(checkKevaRecord(terms, rec({ KevaFrequency: 2 })).ok, false, "שבועית");
  assert.equal(checkKevaRecord(terms, rec({ KevaCurrency: 2 })).ok, false, "דולר");
  assert.equal(checkKevaRecord(terms, rec({ KevaAmount: "4.9" })).ok, false, "סכום חודשי שונה");
  assert.equal(checkKevaRecord(terms, rec({ KevaTashlumim: 5 })).ok, false, "פחות חיובים מהצפוי");
  assert.equal(checkKevaRecord(terms, rec({ KevaTashlumim: "" })).ok, false, "ללא הגבלה / לא ידוע");
  assert.equal(parseKevaRecord({ nothing: 1 }), null);
  assert.equal(parseKevaRecord(null), null);
});

test("sameIntentParams: אותו מסלול בתנאי תשלום שונים הוא לא 'אותה הזמנה'", () => {
  const a = { plan: "yearly", categoryIds: [1], subjectsPending: false, amount: 58800, chargeMode: "normal", installments: 1 };
  assert.equal(sameIntentParams(a, { ...a }), true);
  assert.equal(sameIntentParams(a, { ...a, chargeMode: "keva", installments: 12 }), false);
  assert.equal(sameIntentParams(a, { ...a, chargeMode: undefined, installments: undefined }), true, "בקשות ישנות = normal/1");
});
