import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  nedarimPaymentEvents,
  nedarimPayments,
  nedarimTransactions,
  privateCoupons,
  purchases,
  transactions,
  users,
  type NedarimPayment,
  type Plan,
} from "@/db/schema";
import { PLANS, formatPrice } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { sendMail, templates } from "@/lib/mail";
import { getPlanPrices, type PlanPrices } from "@/lib/pricing";
import { termFields } from "@/lib/purchase-helpers";
import {
  INTENT_TTL_HOURS,
  OPEN_STATUSES,
  checkManualTransaction,
  extractCallbackFields,
  generateReference,
  needsPurchaseRepair,
  settlementPlan,
  type MatchKind,
  type PayablePlan,
  type TxForMatch,
  type VerifyMethod,
} from "./logic";
import { redactNedarim } from "./secrets";

/**
 * שכבת ה-DB של התשלום דרך נדרים פלוס (שרת בלבד). docs/nedarim-payments.md
 *
 * - כל בקשה = שורת nedarim_payments עם reference ייחודי (אקראי קריפטוגרפי) שנוצר לפני ההפניה לדף התשלום של נדרים; כל צעד
 *   נרשם ב-nedarim_payment_events (אחרי הסתרת סודות).
 * - המנוי נפתח רק מעסקה שנמצאה בהיסטוריית המוסד (sync.ts → settleFromTransaction), מאישור ידני של המנהלת, או במצב דמה.
 *   CallBack (אם הוגדר אצל נדרים) רק מפעיל רענון – לא משלים.
 * - אידמפוטנטיות בלי טרנזקציות (neon-http): תפיסת העסקה (UPDATE מותנה על matched_payment_id) → תפיסת הבקשה (UPDATE מותנה על
 *   הסטטוס; האינדקס הייחודי החלקי על transaction_id מונע שתי בקשות על עסקה אחת) → ורק הזוכה מכניס את שורות purchases.
 * - שורות ה-purchases נבנות בדיוק כמו בקופה המדומה (purchaseAction): שורה לכל מקצוע, הסכום על הראשונה, תוקף מההורדה הראשונה.
 */

/** JSON לשמירה ב-DB – תמיד אחרי הסתרת סודות (npk_, סוד ה-CallBack וכו') */
const safeJson = (v: unknown) => {
  try {
    return redactNedarim(JSON.stringify(v)).slice(0, 20000);
  } catch {
    return redactNedarim(String(v)).slice(0, 20000);
  }
};
const errText = (e: unknown) => redactNedarim(e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function appendEvent(paymentId: number, kind: string, message = "", detail: unknown = null) {
  try {
    await db.insert(nedarimPaymentEvents).values({
      paymentId,
      kind,
      message: redactNedarim(String(message ?? "")).slice(0, 500),
      detail: detail === null || detail === undefined ? null : safeJson(detail),
    });
  } catch (e) {
    console.error("[nedarim] event not written", kind, errText(e));
  }
}

export const getByReference = async (reference: string): Promise<NedarimPayment | null> => {
  const [row] = await db.select().from(nedarimPayments).where(eq(nedarimPayments.reference, reference)).limit(1);
  return row ?? null;
};
export const getById = async (id: number): Promise<NedarimPayment | null> => {
  const [row] = await db.select().from(nedarimPayments).where(eq(nedarimPayments.id, id)).limit(1);
  return row ?? null;
};

export function parseCategoryIds(row: Pick<NedarimPayment, "categoryIds">): number[] {
  try {
    const arr: unknown = JSON.parse(row.categoryIds || "[]");
    return Array.isArray(arr) ? arr.filter((x): x is number => Number.isInteger(x) && x > 0) : [];
  } catch {
    return [];
  }
}

/** תיאור קצר של מה נרכש (למייל / לתנועה הכספית / למנהלת) */
export function describeIntent(row: Pick<NedarimPayment, "plan" | "subjectsPending" | "couponPercent">, subjectTitles: string[] = []) {
  const label = PLANS[row.plan].label;
  const subjects = subjectTitles.length ? ` – ${subjectTitles.join(", ")}` : row.subjectsPending ? " – המקצועות ייבחרו בחשבון" : "";
  const coupon = row.couponPercent ? ` (קופון ${row.couponPercent}% הנחה)` : "";
  return `${label}${subjects}${coupon}`;
}

/** בקשה פתוחה של המשתמשת עם אותו קופון (M2) – לא יוצרים בקשה שנייה על אותו קופון, משתמשים בקיימת */
export async function findOpenWithCoupon(userId: number, couponId: number): Promise<NedarimPayment | null> {
  const [row] = await db
    .select()
    .from(nedarimPayments)
    .where(and(eq(nedarimPayments.userId, userId), eq(nedarimPayments.couponId, couponId), inArray(nedarimPayments.status, [...OPEN_STATUSES])))
    .orderBy(desc(nedarimPayments.createdAt))
    .limit(1);
  return row ?? null;
}

/** יצירת בקשת תשלום חדשה (status pending). המקצועות כבר אומתו ע"י הקורא (מקצועות ראשיים, 1–3). */
export async function createIntent(input: {
  userId: number;
  plan: PayablePlan;
  categoryIds: number[];
  subjectsPending: boolean;
  listAmount: number;
  amount: number;
  coupon: { id: number; percent: number } | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  mosadId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<NedarimPayment> {
  let lastErr: unknown;
  for (let i = 0; i < 5; i++) {
    const reference = generateReference((n) => randomBytes(n));
    try {
      const [row] = await db
        .insert(nedarimPayments)
        .values({
          reference,
          userId: input.userId,
          status: "pending",
          plan: input.plan,
          categoryIds: JSON.stringify(input.categoryIds),
          subjectsPending: input.subjectsPending,
          amount: input.amount,
          listAmount: input.listAmount,
          couponId: input.coupon?.id ?? null,
          couponPercent: input.coupon?.percent ?? null,
          firstName: input.firstName.slice(0, 60),
          lastName: input.lastName.slice(0, 60),
          phone: input.phone.slice(0, 20),
          email: input.email.slice(0, 255),
          mosadId: input.mosadId.slice(0, 20) || null,
          ip: input.ip ? input.ip.slice(0, 64) : null,
          userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
        })
        .returning();
      await appendEvent(row.id, "created", `בקשה נוצרה: ${formatPrice(row.amount)} (${row.plan})`, {
        categoryIds: input.categoryIds,
        subjectsPending: input.subjectsPending,
        coupon: input.coupon,
      });
      return row;
    } catch (e) {
      lastErr = e;
      // רק התנגשות reference (unique) חוזרת על עצמה
      if (!/unique|duplicate/i.test(errText(e))) throw e;
    }
  }
  throw lastErr;
}

/** עדכון שדות על בקשה – כל טקסט חופשי עובר הסתרת סודות */
export async function touchPayment(id: number, patch: Partial<typeof nedarimPayments.$inferInsert>) {
  const clean = { ...patch };
  if (typeof clean.errorMessage === "string") clean.errorMessage = redactNedarim(clean.errorMessage).slice(0, 500);
  if (typeof clean.callbackBody === "string") clean.callbackBody = redactNedarim(clean.callbackBody).slice(0, 20000);
  await db
    .update(nedarimPayments)
    .set({ ...clean, updatedAt: new Date() })
    .where(eq(nedarimPayments.id, id));
}

/** שורות ה-purchases שהתשלום מייצר – אותם כללים כמו purchaseAction (src/lib/actions/purchase.ts) */
export function buildPurchaseRows(
  intent: Pick<NedarimPayment, "userId" | "plan" | "categoryIds" | "subjectsPending" | "amount" | "reference">,
  prices: Pick<PlanPrices, "substituteDailyDownloads">,
): (typeof purchases.$inferInsert)[] {
  const plan = intent.plan as Plan;
  const def = PLANS[plan];
  const days = def.days ?? 30;
  const base = { userId: intent.userId, plan, paymentRef: intent.reference, status: "active" as const };
  if (plan === "substitute_daily") {
    return [{ ...base, categoryId: null, amount: intent.amount, downloadsLimit: prices.substituteDailyDownloads, endsAt: null, termDays: null }];
  }
  const term = termFields(plan, days);
  if (plan === "yearly" && intent.subjectsPending) {
    return [{ ...base, categoryId: null, subjectsPending: true, amount: intent.amount, downloadsLimit: def.downloadsLimit ?? null, ...term }];
  }
  const ids = parseCategoryIds(intent);
  if (!ids.length) throw new Error("לבקשה אין מקצועות ואין סימון «ממתין לבחירה»");
  return ids.map((categoryId, i) => ({
    ...base,
    categoryId,
    amount: i === 0 ? intent.amount : 0,
    downloadsLimit: def.downloadsLimit ?? null,
    ...term,
  }));
}

export type SettleResult =
  | { ok: true; status: string; verified: boolean; reason: string; purchaseId?: number | null; /** הקריאה הזו היא שתפסה את הבקשה */ claimed: boolean }
  | { ok: false; error: string; /** נדרש אישור ידני (למשל קופון שכבר נוצל) */ review?: boolean };

/**
 * ההשלמה: תפיסה אטומית של הבקשה (UPDATE מותנה; האינדקס הייחודי על transaction_id מונע עסקה אחת → שתי בקשות) →
 * תפיסת הקופון (M2: נכשל → חזרה ל-processing לאישור ידני, בלי מנוי) → שורות purchases (M5: אם כבר קיימות מניסיון קודם –
 * לא מכניסים שוב) → תנועה כספית + אירועים + מייל. **אחרי ש-purchases נכנסו, שום כישלון לא מחזיר אחורה** – נשארים paid + אירוע error.
 */
async function settle(
  intent: NedarimPayment,
  how: { method: VerifyMethod; verified: boolean; reason: string; transactionId?: string | null; confirmation?: string | null; last4?: string | null; byId?: number | null },
): Promise<SettleResult> {
  const paidAt = new Date();
  const byId = how.byId ?? null;
  let claimed: { id: number }[];
  try {
    claimed = await db
      .update(nedarimPayments)
      .set({
        status: "paid",
        verified: how.verified,
        verifyMethod: how.method,
        transactionId: how.transactionId ?? intent.transactionId,
        confirmation: how.confirmation ?? intent.confirmation,
        cardLast4: how.last4 ?? intent.cardLast4,
        paidAt,
        settledById: byId,
        errorMessage: null,
        updatedAt: paidAt,
      })
      .where(and(eq(nedarimPayments.id, intent.id), inArray(nedarimPayments.status, [...OPEN_STATUSES])))
      .returning({ id: nedarimPayments.id });
  } catch (e) {
    const reason = /unique|duplicate/i.test(errText(e)) ? "עסקה זו כבר שויכה לבקשה אחרת (TransactionId כפול)" : `ההשלמה נכשלה: ${errText(e)}`;
    await touchPayment(intent.id, { status: "processing", errorMessage: reason });
    await appendEvent(intent.id, "error", reason);
    return { ok: false, error: reason, review: true };
  }
  if (!claimed.length) {
    const fresh = await getById(intent.id);
    return { ok: true, status: fresh?.status ?? "paid", verified: fresh?.verified ?? false, reason: "כבר טופל", purchaseId: fresh?.purchaseId, claimed: false };
  }

  // --- קופון (M2): נתפס לפני יצירת המנוי; נכשל → אין מנוי, אישור ידני ---
  let couponClaimed = false;
  if (intent.couponId) {
    const got = await db
      .update(privateCoupons)
      .set({ status: "used", usedAt: paidAt, claimedBy: intent.userId })
      .where(and(eq(privateCoupons.id, intent.couponId), eq(privateCoupons.status, "active")))
      .returning({ id: privateCoupons.id });
    couponClaimed = got.length > 0;
    // ניסיון חוזר אחרי כישלון מאוחר: הקופון כבר נתפס לבקשה הזו – תקין
    if (!couponClaimed) {
      const [c] = await db.select({ status: privateCoupons.status, claimedBy: privateCoupons.claimedBy }).from(privateCoupons).where(eq(privateCoupons.id, intent.couponId)).limit(1);
      if (c?.status === "used" && c.claimedBy === intent.userId && intent.purchaseId) couponClaimed = true;
    }
  }
  // --- purchases קיימים מניסיון קודם (M5) – גם לפי payment_ref, למקרה ש-purchase_id לא נשמר ---
  let existingPurchaseId = intent.purchaseId ?? null;
  if (!existingPurchaseId) {
    const [p] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.paymentRef, intent.reference)).limit(1);
    existingPurchaseId = p?.id ?? null;
  }
  const plan = settlementPlan({ hasCoupon: !!intent.couponId, couponClaimed, existingPurchaseId });
  if (plan === "wait_coupon") {
    const reason = "הקופון שבבקשה כבר נוצל/בוטל – המחיר ששולם מוזל; לאישור ידני של המנהלת";
    await touchPayment(intent.id, { status: "processing", verifyMethod: null, paidAt: null, errorMessage: reason });
    await appendEvent(intent.id, "coupon_conflict", reason, { couponId: intent.couponId });
    return { ok: false, error: reason, review: true };
  }

  let purchaseId = existingPurchaseId;
  let rows: (typeof purchases.$inferInsert)[] = [];
  if (plan === "insert") {
    try {
      const prices = await getPlanPrices();
      rows = buildPurchaseRows(intent, prices);
      const inserted = await db.insert(purchases).values(rows).returning({ id: purchases.id });
      purchaseId = inserted[0]?.id ?? null;
    } catch (e) {
      // עוד לא נוצר מנוי – בטוח לחזור אחורה (ולשחרר את הקופון שתפסנו עכשיו)
      const msg = errText(e);
      console.error("[nedarim] purchases insert failed", msg);
      if (intent.couponId && couponClaimed && !intent.purchaseId) {
        await db.update(privateCoupons).set({ status: "active", usedAt: null }).where(and(eq(privateCoupons.id, intent.couponId), eq(privateCoupons.claimedBy, intent.userId)));
      }
      await touchPayment(intent.id, { status: "processing", verifyMethod: null, paidAt: null, errorMessage: `יצירת המנוי נכשלה: ${msg}` });
      await appendEvent(intent.id, "error", `יצירת המנוי נכשלה: ${msg}`);
      return { ok: false, error: `יצירת המנוי נכשלה: ${msg}`, review: true };
    }
  } else {
    await appendEvent(intent.id, "reuse_purchase", `המנוי כבר נוצר בניסיון קודם (#${purchaseId}) – רק סימון paid`);
  }

  // --- מכאן: המנוי קיים. כל כישלון = אירוע error, נשארים paid (M5) ---
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.error(`[nedarim] post-settle step failed: ${name}`, errText(e));
      await appendEvent(intent.id, "error", `שלב «${name}» נכשל אחרי יצירת המנוי (המנוי נשאר פעיל): ${errText(e)}`);
    }
  };
  await step("purchase_id", () => touchPayment(intent.id, { purchaseId }));
  const txId = how.transactionId ?? intent.transactionId;
  const description = describeIntent(intent);
  if (plan === "insert") {
    await step("תנועה כספית", async () => {
      const noteParts = [`תשלום דרך נדרים פלוס ${intent.reference}`, description];
      if (txId) noteParts.push(`עסקה ${txId}`);
      if (how.confirmation ?? intent.confirmation) noteParts.push(`אישור ${how.confirmation ?? intent.confirmation}`);
      if (how.method === "manual") noteParts.push("אושר ידנית");
      if (how.method === "simulated") noteParts.push("סימולציה");
      await db.insert(transactions).values({
        userId: intent.userId,
        purchaseId,
        type: how.method === "manual" ? "manual" : "charge",
        amount: intent.amount,
        method: how.method === "simulated" ? "nedarim-sim" : "nedarim",
        reference: intent.reference,
        note: noteParts.join(" | ").slice(0, 500),
        createdById: byId,
      });
    });
  }
  await appendEvent(intent.id, how.method === "manual" ? "manual_settle" : "settled", `הושלם (${how.method}${how.reason ? `, ${how.reason}` : ""}) – ${plan === "insert" ? "נוצר מנוי" : "המנוי כבר היה קיים"}`, {
    purchaseId,
    rows: rows.length,
    transactionId: txId,
    byId,
  });
  await logAudit({
    actorId: byId ?? intent.userId,
    action: how.method === "manual" ? "purchase.nedarim_manual" : "purchase.nedarim",
    entityType: "purchase",
    entityId: purchaseId,
    details: { reference: intent.reference, plan: intent.plan, amount: intent.amount, verified: how.verified, method: how.method, matchKind: how.method === "api_weak" ? "weak_auto" : how.method === "api" ? "strong" : null, transactionId: txId, categoryIds: parseCategoryIds(intent), reusedPurchase: plan !== "insert" },
  });
  if (plan === "insert") {
    await step("מייל", async () => {
      const [user] = await db.select().from(users).where(eq(users.id, intent.userId)).limit(1);
      if (!user) return;
      const t = templates.purchase(user.name, description, formatPrice(intent.amount), rows[0]?.endsAt ?? null);
      const send = () => sendMail({ to: user.email, ...t, kind: "purchase", userId: user.id }).catch((e) => console.error("[nedarim] mail", errText(e)));
      try {
        after(send); // ממשיך אחרי התשובה (Vercel waitUntil) – לא מעכב את המורה
      } catch {
        void send(); // מחוץ להקשר בקשה (סקריפט)
      }
    });
  }
  return { ok: true, status: "paid", verified: how.verified, reason: how.reason, purchaseId, claimed: true };
}

/** שחרור עסקה שנתפסה לבקשה (כשההשלמה לא הושלמה ע"י הקריאה הזו – L1) */
async function releaseTx(transactionId: string, paymentId: number) {
  await db.update(nedarimTransactions).set({ matchedPaymentId: null }).where(and(eq(nedarimTransactions.transactionId, transactionId), eq(nedarimTransactions.matchedPaymentId, paymentId)));
}

/**
 * השלמה מעסקה שנמצאה בהיסטוריית נדרים (sync.ts, התאמה strong בלבד). תופס קודם את העסקה (matched_payment_id IS NULL → id) –
 * עסקה אחת = בקשה אחת גם בין שני רענונים מקבילים; אם הבקשה לא נתפסה ע"י הקריאה הזו (כולל "כבר טופל") – משחררים את העסקה.
 */
export async function settleFromTransaction(intent: NedarimPayment, tx: TxForMatch, kind: MatchKind = "strong"): Promise<SettleResult> {
  const claimedTx = await db
    .update(nedarimTransactions)
    .set({ matchedPaymentId: intent.id })
    .where(and(eq(nedarimTransactions.transactionId, tx.transactionId), isNull(nedarimTransactions.matchedPaymentId)))
    .returning({ id: nedarimTransactions.transactionId });
  if (!claimedTx.length) return { ok: false, error: "העסקה כבר שויכה" };
  const reason = kind === "weak" ? "weak_auto: טלפון/מייל + סכום זהה, התאמה ייחודית" : "מזהה הבקשה בהערת העסקה";
  await appendEvent(intent.id, "matched", `נמצאה עסקה ${tx.transactionId} (${reason})`, { transactionId: tx.transactionId, amount: tx.amount, at: tx.transactionAt, confirmation: tx.confirmation, matchKind: kind === "weak" ? "weak_auto" : "strong" });
  const r = await settle(intent, { method: kind === "weak" ? "api_weak" : "api", verified: true, reason, transactionId: tx.transactionId, confirmation: tx.confirmation, last4: tx.last4 });
  if (!r.ok || r.status !== "paid" || !r.claimed) await releaseTx(tx.transactionId, intent.id);
  return r;
}

/**
 * תיקון (N7): בקשה paid בלי מנוי (purchase_id ריק ואין purchases לפי payment_ref – כשל אחרי התפיסה בעבר) → יצירת שורות
 * ה-purchases + תנועה כספית, אידמפוטנטית. בקשה paid שכבר יש לה מנוי – מחזיר אותו בלי שינוי.
 */
export async function ensurePurchasesForPaid(intent: NedarimPayment, adminId: number | null): Promise<SettleResult> {
  if (intent.status !== "paid") return { ok: false, error: "הבקשה אינה במצב שולם" };
  let purchaseId = intent.purchaseId ?? null;
  if (!purchaseId) {
    const [p] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.paymentRef, intent.reference)).limit(1);
    purchaseId = p?.id ?? null;
  }
  if (!needsPurchaseRepair(intent.status, intent.purchaseId, !!purchaseId)) {
    if (!intent.purchaseId && purchaseId) await touchPayment(intent.id, { purchaseId });
    return { ok: true, status: "paid", verified: intent.verified, reason: "כבר יש מנוי", purchaseId, claimed: false };
  }
  try {
    const prices = await getPlanPrices();
    const rows = buildPurchaseRows(intent, prices);
    const inserted = await db.insert(purchases).values(rows).returning({ id: purchases.id });
    purchaseId = inserted[0]?.id ?? null;
    await touchPayment(intent.id, { purchaseId });
    try {
      await db.insert(transactions).values({
        userId: intent.userId,
        purchaseId,
        type: "charge",
        amount: intent.amount,
        method: "nedarim",
        reference: intent.reference,
        note: `תשלום דרך נדרים פלוס ${intent.reference} | ${describeIntent(intent)} | תיקון מנוי חסר`.slice(0, 500),
        createdById: adminId,
      });
    } catch (e) {
      await appendEvent(intent.id, "error", `תנועה כספית בתיקון נכשלה: ${errText(e)}`);
    }
    await appendEvent(intent.id, "repaired", `נוצר המנוי החסר לבקשה ששולמה (#${purchaseId})`, { purchaseId, rows: rows.length, adminId });
    await logAudit({ actorId: adminId ?? intent.userId, action: "purchase.nedarim_repair", entityType: "purchase", entityId: purchaseId, details: { reference: intent.reference, plan: intent.plan, amount: intent.amount } });
    return { ok: true, status: "paid", verified: intent.verified, reason: "המנוי החסר נוצר", purchaseId, claimed: false };
  } catch (e) {
    const msg = errText(e);
    await appendEvent(intent.id, "error", `תיקון המנוי נכשל: ${msg}`);
    return { ok: false, error: `תיקון המנוי נכשל: ${msg}` };
  }
}

/**
 * אישור ידני ממסך הניהול. transactionId אופציונלי: אם העסקה קיימת במטמון – נבדקת (M1: מאושרת, סכום זהה, חיובית, ש"ח) ונתפסת;
 * סטייה → סירוב, אלא אם force (אישור חריג מפורש – המנהלת מקבלת את הסכומים ומאשרת; הקורא רושם אודיט).
 * על בקשה paid בלי מנוי – מתקן (N7). העסקה משוחררת רק אם הקריאה הזו תפסה אותה (N6).
 */
export async function manualSettle(id: number, adminId: number, transactionId?: string | null, force = false): Promise<SettleResult & { mismatch?: string }> {
  const intent = await getById(id);
  if (!intent) return { ok: false, error: "בקשה לא נמצאה" };
  if (intent.status === "paid") return ensurePurchasesForPaid(intent, adminId);
  if (!OPEN_STATUSES.includes(intent.status as (typeof OPEN_STATUSES)[number])) return { ok: false, error: "בקשה שבוטלה/פגה – ליצור בקשה חדשה או מנוי ידני ב«מנויים»" };
  const tid = transactionId?.trim() || null;
  let reason = "אישור ידני";
  let txConfirmation: string | null = null;
  let txLast4: string | null = null;
  let claimedHere = false;
  if (tid) {
    const [cached] = await db.select().from(nedarimTransactions).where(eq(nedarimTransactions.transactionId, tid)).limit(1);
    if (cached) {
      if (cached.matchedPaymentId && cached.matchedPaymentId !== intent.id) return { ok: false, error: `עסקה ${tid} כבר שויכה לבקשה אחרת` };
      const check = checkManualTransaction(intent, { amount: cached.amount, currency: cached.currency, approved: cached.approved, confirmation: cached.confirmation });
      if (!check.ok && !force) return { ok: false, error: `${check.reason} – לאישור חריג יש לאשר במפורש`, mismatch: check.reason };
      if (!check.ok) {
        reason = `אישור ידני חריג: ${check.reason}`;
        await appendEvent(intent.id, "manual_override", reason, { transactionId: tid, txAmount: cached.amount, intentAmount: intent.amount, currency: cached.currency, approved: cached.approved, adminId });
      }
      const claimedTx = await db
        .update(nedarimTransactions)
        .set({ matchedPaymentId: intent.id })
        .where(and(eq(nedarimTransactions.transactionId, tid), isNull(nedarimTransactions.matchedPaymentId)))
        .returning({ id: nedarimTransactions.transactionId });
      if (!claimedTx.length && cached.matchedPaymentId !== intent.id) return { ok: false, error: `עסקה ${tid} נתפסה בינתיים לבקשה אחרת` };
      claimedHere = claimedTx.length > 0;
      txConfirmation = cached.confirmation;
      txLast4 = cached.last4;
    } else {
      reason = "אישור ידני (מספר עסקה לא נמצא במטמון – לא אומת)";
      await appendEvent(intent.id, "manual_unverified", `מספר עסקה ${tid} אינו במטמון ההיסטוריה – האישור על אחריות המנהלת`, { transactionId: tid, adminId });
    }
  }
  const r = await settle(intent, { method: "manual", verified: !!tid && !!txConfirmation, reason, transactionId: tid, confirmation: txConfirmation, last4: txLast4, byId: adminId });
  if (tid && claimedHere && (!r.ok || r.status !== "paid" || !r.claimed)) await releaseTx(tid, intent.id);
  return r;
}

/** ביטול בקשה פתוחה שהוחלפה בבקשה חדשה של אותה משתמשת עם אותו קופון אבל פרמטרים אחרים (N2) */
export async function cancelReplaced(old: NedarimPayment, newReference: string) {
  const r = await db
    .update(nedarimPayments)
    .set({ status: "cancelled", errorMessage: `הוחלפה בבקשה ${newReference} (שינוי מסלול/מקצועות/סכום)`, updatedAt: new Date() })
    .where(and(eq(nedarimPayments.id, old.id), inArray(nedarimPayments.status, [...OPEN_STATUSES])))
    .returning({ id: nedarimPayments.id });
  if (r.length) await appendEvent(old.id, "replaced", `בוטלה – הוחלפה בבקשה ${newReference}. עסקה שתשולם עליה תישאר לא-משויכת (לאישור ידני)`, { newReference });
  return r.length > 0;
}

/** מצב דמה (פיתוח מקומי בלבד – הקורא בודק simulateAllowed) */
export const simulatedSettle = (intent: NedarimPayment) => settle(intent, { method: "simulated", verified: false, reason: "מצב דמה (פיתוח בלבד)" });

export async function cancelIntent(id: number, adminId: number, reason = "") {
  const intent = await getById(id);
  if (!intent) return { ok: false as const, error: "בקשה לא נמצאה" };
  if (intent.status === "paid") {
    return { ok: false as const, error: "בקשה שהושלמה אינה ניתנת לביטול מכאן – לזיכוי: ביטול/זיכוי המנוי ב«מנויים» וזיכוי בפורטל נדרים" };
  }
  await touchPayment(id, { status: "cancelled", settledById: adminId, errorMessage: reason ? reason.slice(0, 500) : intent.errorMessage });
  await appendEvent(id, "cancelled", `בוטל ידנית${reason ? `: ${reason}` : ""}`, { adminId });
  return { ok: true as const, status: "cancelled" };
}

/** CallBack מנדרים (אופציונלי): רק רישום על הבקשה + יומן. הרענון וההתאמה – ב-route (sync.refreshHistory). */
export async function recordCallback(body: Record<string, unknown>, raw: string): Promise<{ matched: boolean; paymentId: number | null }> {
  const f = extractCallbackFields(body);
  const row = f.reference ? await getByReference(f.reference) : null;
  if (!row) return { matched: false, paymentId: null };
  // N8: מזהה עסקה שכבר פתח מנוי על בקשה paid אחרת לא נכתב על הבקשה הזו (רק ביומן)
  let txToWrite: string | null = null;
  if (f.transactionId && !row.transactionId) {
    const [other] = await db
      .select({ id: nedarimPayments.id })
      .from(nedarimPayments)
      .where(and(eq(nedarimPayments.transactionId, f.transactionId), eq(nedarimPayments.status, "paid")))
      .limit(1);
    if (other && other.id !== row.id) await appendEvent(row.id, "callback_conflict", `CallBack עם עסקה ${f.transactionId} ששייכת כבר לבקשה אחרת – לא נרשמה`, { transactionId: f.transactionId, otherPaymentId: other.id });
    else txToWrite = f.transactionId;
  }
  await touchPayment(row.id, { callbackBody: raw.slice(0, 20000), ...(txToWrite ? { transactionId: txToWrite } : {}) });
  await appendEvent(row.id, "callback", "התקבל CallBack מנדרים פלוס – מפעיל רענון היסטוריה", { transactionId: f.transactionId, amount: f.amount });
  return { matched: true, paymentId: row.id };
}

/** המורה ביקשה עזרה מהמנהלת (דף התשלום לא נפתח / בעיה אחרת): סימון + מייל למנהלת. הבקשה יוצאת מההתאמה האוטומטית. */
export async function requestAssist(row: NedarimPayment, adminMail: string | null) {
  if (!OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number])) {
    return { ok: false as const, error: "הבקשה כבר אינה פתוחה" };
  }
  const already = !!row.assistRequestedAt;
  if (!already) await touchPayment(row.id, { assistRequestedAt: new Date() });
  await appendEvent(row.id, "assist", already ? "בקשת סיוע חוזרת" : "המורה ביקשה עזרה מהמנהלת בהשלמת התשלום");
  if (!already && adminMail) {
    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (user) {
      const t = templates.payAssistAdmin({
        userName: user.name,
        email: user.email,
        phone: row.phone ?? user.phone,
        reference: row.reference,
        planLabel: PLANS[row.plan].label,
        amountText: formatPrice(row.amount),
      });
      const send = () => sendMail({ to: adminMail, ...t, kind: "pay_assist", userId: user.id }).catch((e) => console.error("[nedarim] assist mail", errText(e)));
      try {
        after(send);
      } catch {
        void send();
      }
    }
  }
  return { ok: true as const };
}

/** בקשות 'pending' ישנות → 'expired' (רץ מטעינת מסך הניהול) */
export async function expireStale(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - INTENT_TTL_HOURS * 60 * 60 * 1000);
  const r = await db
    .update(nedarimPayments)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(nedarimPayments.status, "pending"), lt(nedarimPayments.createdAt, before)))
    .returning({ id: nedarimPayments.id });
  return r.length;
}
