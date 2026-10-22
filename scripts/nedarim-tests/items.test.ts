/**
 * בדיקות רכישת פריט דרך נדרים (הורדה בודדת / קובץ מורחב) – לוגיקה טהורה בלבד (בלי DB, בלי רשת). כל הנתונים מומצאים.
 * הרצה: npx tsx --test scripts/nedarim-tests/items.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GROUPE_NAMES,
  ITEM_COVERED_TEXT,
  ITEM_GROUPE_NAMES,
  PAY_KEYS,
  PLAN_GROUPE_NAMES,
  buildTransactionComment,
  customerStatusText,
  describeItem,
  groupeNameFor,
  hostedPaymentUrl,
  isPayKey,
  isPayableItemKind,
  itemAlreadyCovered,
  itemPurchaseRow,
  itemSuccessHref,
  orderKindOf,
  sameIntentParams,
  type ActivePurchaseLite,
} from "../../src/lib/nedarim/logic";

test("pay keys: plans + item kinds; groupe names for every key; unknown key passed through", () => {
  assert.deepEqual([...PAY_KEYS], ["yearly", "substitute_3m", "substitute_daily", "single", "bundle"]);
  assert.equal(isPayableItemKind("single"), true);
  assert.equal(isPayableItemKind("yearly"), false);
  assert.equal(isPayKey("bundle"), true);
  assert.equal(isPayKey("premium"), false);
  assert.equal(orderKindOf("yearly"), "plan");
  assert.equal(orderKindOf("single"), "single");
  assert.equal(orderKindOf("bundle"), "bundle");
  assert.equal(ITEM_GROUPE_NAMES.single, "הורדה בודדת");
  assert.equal(ITEM_GROUPE_NAMES.bundle, "קובץ מורחב");
  for (const k of PAY_KEYS) assert.ok(GROUPE_NAMES[k], `groupe name for ${k}`);
  assert.equal(groupeNameFor("yearly"), PLAN_GROUPE_NAMES.yearly);
  assert.equal(groupeNameFor("single"), "הורדה בודדת");
  assert.equal(groupeNameFor("custom"), "custom");
  // שמות ייחודיים – שם כפול בנדרים נדחה
  assert.equal(new Set(Object.values(GROUPE_NAMES)).size, PAY_KEYS.length);
});

test("hosted URL for an item: groupe = item category name, avour names the item without PII, amount locked", () => {
  const url = hostedPaymentUrl({
    mosadId: "7019454",
    amountAgorot: 1500,
    reference: "NP-ABCDEFGH",
    clientName: "רחל כהן",
    phone: "0501234567",
    email: "r@example.com",
    planKey: "bundle",
    description: buildTransactionComment("לו״ז העניין", "קובץ מורחב", "פרשת לך לך"),
    redirectUrl: "https://example.com/pay?ref=NP-ABCDEFGH",
  });
  const u = new URL(url);
  assert.equal(u.searchParams.get("groupe"), "קובץ מורחב");
  assert.equal(u.searchParams.get("Amount"), "15");
  assert.equal(u.searchParams.get("AmountLock"), "1");
  assert.equal(u.searchParams.get("Analytic"), "NP-ABCDEFGH");
  assert.equal(u.searchParams.get("avour"), "לו״ז העניין - קובץ מורחב - פרשת לך לך");
  assert.ok(!u.searchParams.get("avour")!.includes("רחל") && !u.searchParams.get("avour")!.includes("0501234567"));
  const single = new URL(hostedPaymentUrl({ mosadId: "1", amountAgorot: 790, reference: "NP-ABCDEFGH", clientName: "", phone: "", email: "", planKey: "single", description: "", redirectUrl: "" }));
  assert.equal(single.searchParams.get("groupe"), "הורדה בודדת");
  assert.equal(single.searchParams.get("Amount"), "7.9");
});

test("buildTransactionComment: title appended, whitespace collapsed, capped at 100 chars, empty title = old behaviour", () => {
  assert.equal(buildTransactionComment("לו״ז העניין", "מנוי שנתי"), "לו״ז העניין - מנוי שנתי");
  assert.equal(buildTransactionComment("לו״ז העניין", "מנוי שנתי", ""), "לו״ז העניין - מנוי שנתי");
  assert.equal(buildTransactionComment("אתר", "הורדה בודדת", "  דף\nהעשרה \t פרק  כ  "), "אתר - הורדה בודדת - דף העשרה פרק כ");
  assert.equal(buildTransactionComment("אתר", "הורדה בודדת", "א".repeat(300)).length, 100);
});

test("describeItem / itemSuccessHref / customerStatusText per kind", () => {
  assert.equal(describeItem("single", "דף העשרה"), "הורדה בודדת – דף העשרה");
  assert.equal(describeItem("single", null), "הורדה בודדת");
  assert.equal(describeItem("bundle", "פרשת נח"), "קובץ מורחב – תיקייה «פרשת נח»");
  assert.equal(describeItem("bundle", ""), "קובץ מורחב (תיקייה שלמה)");
  assert.equal(itemSuccessHref("bundle", "/subjects/torah/noach"), "/subjects/torah/noach?dlall=1", "folder download-all like the old mock");
  assert.equal(itemSuccessHref("single", "/subjects/torah/noach"), "/subjects/torah/noach");
  assert.ok(customerStatusText("paid").includes("המנוי"));
  assert.ok(customerStatusText("paid", false, false, "single").includes("הקובץ"));
  assert.ok(customerStatusText("paid", false, false, "bundle").includes("התיקייה"));
  assert.equal(customerStatusText("pending", false, false, "single"), customerStatusText("pending"), "non-paid texts unchanged");
});

test("itemPurchaseRow: exactly the rows the old purchaseAction created (no quota, no expiry, amount after coupon)", () => {
  const single = itemPurchaseRow({ userId: 7, plan: "single", materialId: 55, itemCategoryId: 9, amount: 711, reference: "NP-ABCDEFGH" });
  assert.deepEqual(single, { userId: 7, plan: "single", materialId: 55, categoryId: 9, amount: 711, downloadsLimit: null, endsAt: null, termDays: null, paymentRef: "NP-ABCDEFGH", status: "active" });
  const bundle = itemPurchaseRow({ userId: 7, plan: "bundle", materialId: null, itemCategoryId: 9, amount: 1500, reference: "NP-ABCDEFGH" });
  assert.deepEqual(bundle, { userId: 7, plan: "bundle", materialId: null, categoryId: 9, amount: 1500, downloadsLimit: null, endsAt: null, termDays: null, paymentRef: "NP-ABCDEFGH", status: "active" });
  assert.throws(() => itemPurchaseRow({ userId: 7, plan: "single", materialId: null, itemCategoryId: 9, amount: 1, reference: "NP-ABCDEFGH" }), /מזהה חומר/);
  assert.throws(() => itemPurchaseRow({ userId: 7, plan: "bundle", materialId: null, itemCategoryId: null, amount: 1, reference: "NP-ABCDEFGH" }), /מזהה תיקייה/);
});

test("N2 for items: same coupon reuses only the same material / folder", () => {
  const a = { plan: "single", categoryIds: [], subjectsPending: false, amount: 790, materialId: 55, itemCategoryId: 9 };
  assert.equal(sameIntentParams(a, { ...a }), true);
  assert.equal(sameIntentParams(a, { ...a, materialId: 56 }), false, "different material");
  assert.equal(sameIntentParams(a, { ...a, itemCategoryId: 10 }), false);
  const b = { plan: "bundle", categoryIds: [], subjectsPending: false, amount: 1500, materialId: null, itemCategoryId: 9 };
  assert.equal(sameIntentParams(b, { ...b }), true);
  assert.equal(sameIntentParams(b, { ...b, itemCategoryId: 11 }), false, "different folder");
  // מסלולים ישנים בלי השדות – עדיין זהים (undefined ≡ null)
  const p = { plan: "yearly", categoryIds: [1], subjectsPending: false, amount: 50000 };
  assert.equal(sameIntentParams(p, { ...p, materialId: null, itemCategoryId: null }), true);
});

test("itemAlreadyCovered: exact duplicate, parent bundle, covering subscription; what does NOT block", () => {
  const lite = (p: Partial<ActivePurchaseLite> & { plan: string }): ActivePurchaseLite => ({ materialId: null, categoryId: null, subjectsPending: false, downloadsLimit: null, downloadsUsed: 0, ...p });
  // חומר 55 בתיקייה 9, שרשרת: מקצוע 1 → יחידה 4 → תיקייה 9
  const single = { materialId: 55, categoryId: 9, chainIds: [1, 4, 9] };
  assert.equal(itemAlreadyCovered("single", single, []), null);
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "single", materialId: 55, categoryId: 9 })]), "owned");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "single", materialId: 56, categoryId: 9 })]), null, "another material in the same folder");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "bundle", categoryId: 9 })]), "bundle", "the material's own folder was bought");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "bundle", categoryId: 4 })]), "bundle", "an ancestor folder covers it");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "bundle", categoryId: 77 })]), null, "unrelated folder");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "yearly", categoryId: 1 })]), "subscription", "yearly for the subject");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "yearly", categoryId: 2 })]), null, "yearly for another subject");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "yearly", categoryId: null, subjectsPending: true })]), null, "subjects not chosen yet – no access, may buy");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "substitute_daily", categoryId: null, downloadsLimit: 20, downloadsUsed: 3 })]), "subscription", "daily basket covers every subject");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "substitute_daily", categoryId: null, downloadsLimit: 20, downloadsUsed: 20 })]), null, "basket exhausted – may buy");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "substitute_3m", categoryId: 1, downloadsLimit: 150, downloadsUsed: 150 })]), null, "quota exhausted");
  assert.equal(itemAlreadyCovered("single", single, [lite({ plan: "subject_monthly", categoryId: 1 })]), "subscription", "old plan rows still grant access");
  // תיקייה 9
  const bundle = { materialId: null, categoryId: 9, chainIds: [1, 4, 9] };
  assert.equal(itemAlreadyCovered("bundle", bundle, [lite({ plan: "bundle", categoryId: 9 })]), "owned");
  assert.equal(itemAlreadyCovered("bundle", bundle, [lite({ plan: "bundle", categoryId: 4 })]), "bundle", "parent folder owned");
  assert.equal(itemAlreadyCovered("bundle", bundle, [lite({ plan: "bundle", categoryId: 12 })]), null, "a sub-folder does not cover the parent");
  assert.equal(itemAlreadyCovered("bundle", bundle, [lite({ plan: "single", materialId: 55, categoryId: 9 })]), null, "one material does not cover the folder");
  assert.equal(itemAlreadyCovered("bundle", bundle, [lite({ plan: "yearly", categoryId: 1 })]), "subscription");
  assert.equal(itemAlreadyCovered("bundle", bundle, [lite({ plan: "substitute_daily", categoryId: null, downloadsLimit: 20, downloadsUsed: 0 })]), null, "daily basket (20 downloads) does not block buying a whole folder");
  // הסדר: בעלות ישירה לפני תיקיית-אב לפני מנוי
  assert.equal(itemAlreadyCovered("bundle", bundle, [lite({ plan: "yearly", categoryId: 1 }), lite({ plan: "bundle", categoryId: 9 })]), "owned");
  for (const k of ["owned", "bundle", "subscription"] as const) assert.ok(ITEM_COVERED_TEXT[k].length > 10);
});
