import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  nedarimPaymentEvents,
  nedarimPayments,
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
import type { NedarimConfig } from "./config";
import {
  INTENT_TTL_HOURS,
  OPEN_STATUSES,
  decideSettlement,
  extractTransactionFields,
  generateReference,
  isTransactionOk,
  matchHistoryRow,
  type PayablePlan,
  type SettlementDecision,
} from "./logic";
import { getTransactionHistory } from "./manage";

/**
 * שכבת ה-DB של התשלום דרך נדרים פלוס (שרת בלבד). docs/nedarim-payments.md
 *
 * עקרונות:
 * - כל בקשה = שורת nedarim_payments עם reference ייחודי שנוצר לפני המעבר ל-iframe; כל צעד נרשם ב-nedarim_payment_events.
 * - "הדפדפן אמר שהצליח" אינו ראיה: ההשלמה דורשת אימות מול היסטוריית העסקאות של המוסד (GetHistoryJson, מפתח npk_), או אישור
 *   ידני של המנהלת, או (רק אם NEDARIM_TRUST_CALLBACK=1) CallBack של נדרים בסכום הנכון.
 * - אידמפוטנטיות בלי טרנזקציות (neon-http לא תומך בהן): UPDATE מותנה על הסטטוס "תופס" את הבקשה, ורק הזוכה מכניס את שורות
 *   purchases (כמו upgradeToYearlyAction). CallBack כפול / דפדפן + CallBack יחד = מנוי אחד.
 * - שורות ה-purchases נבנות בדיוק כמו בקופה המדומה (purchaseAction): שורה לכל מקצוע, הסכום על הראשונה, תוקף מההורדה הראשונה
 *   (termFields), ממלאת מקום יומית = סל הורדות לכל המקצועות.
 */

const safeJson = (v: unknown) => {
  try {
    return JSON.stringify(v).slice(0, 20000);
  } catch {
    return String(v).slice(0, 20000);
  }
};

export async function appendEvent(paymentId: number, kind: string, message = "", detail: unknown = null) {
  try {
    await db.insert(nedarimPaymentEvents).values({
      paymentId,
      kind,
      message: String(message ?? "").slice(0, 500),
      detail: detail === null || detail === undefined ? null : safeJson(detail),
    });
  } catch (e) {
    console.error("[nedarim] event not written", kind, e);
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
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate/i.test(msg)) throw e;
    }
  }
  throw lastErr;
}

async function touch(id: number, patch: Partial<typeof nedarimPayments.$inferInsert>) {
  await db
    .update(nedarimPayments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(nedarimPayments.id, id));
}

/** מה הדפדפן קיבל מה-iframe (TransactionResponse.Value). מעדכן מזהים, ואז מנסה להשלים. */
export async function recordClientResponse(row: NedarimPayment, value: unknown, cfg: NedarimConfig) {
  const f = extractTransactionFields(value);
  const ok = isTransactionOk(value);
  const open = OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number]);
  await touch(row.id, {
    clientResponse: safeJson(value),
    ...(f.transactionId ? { transactionId: f.transactionId } : {}),
    ...(f.confirmation ? { confirmation: f.confirmation } : {}),
    ...(f.last4 ? { cardLast4: f.last4 } : {}),
    ...(open ? (ok ? { status: "processing" } : { status: "failed", errorMessage: f.message || "התשלום לא אושר" }) : {}),
  });
  await appendEvent(row.id, "client_response", ok ? "הדפדפן דיווח הצלחה" : `הדפדפן דיווח כישלון: ${f.message ?? ""}`, {
    status: f.status,
    transactionId: f.transactionId,
    amount: f.amount,
  });
  if (!ok) return { ok: true as const, status: "failed", message: f.message ?? "" };
  return verifyAndSettle(row.id, { report: { ok: true, amount: f.amount, fromCallback: false, message: f.message }, cfg });
}

/** ה-CallBack של נדרים פלוס (POST /api/pay/callback). body = אובייקט מפוענח, raw = הטקסט הגולמי. */
export async function recordCallback(body: Record<string, unknown>, raw: string, cfg: NedarimConfig) {
  const f = extractTransactionFields(body);
  let row = f.reference ? await getByReference(f.reference) : null;
  if (!row && f.transactionId) {
    const [byTx] = await db
      .select()
      .from(nedarimPayments)
      .where(eq(nedarimPayments.transactionId, f.transactionId))
      .orderBy(desc(nedarimPayments.createdAt))
      .limit(1);
    row = byTx ?? null;
  }
  if (!row) return { ok: false as const, error: "לא זוהתה בקשה (אין Param1/מזהה עסקה מוכר)", fields: f };
  const ok = f.ok !== false; // CallBack בלי שדה Status = מתייחסים כדיווח, האימות מכריע
  const open = OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number]);
  await touch(row.id, {
    callbackBody: String(raw ?? "").slice(0, 20000),
    ...(f.transactionId ? { transactionId: f.transactionId } : {}),
    ...(f.confirmation ? { confirmation: f.confirmation } : {}),
    ...(f.last4 ? { cardLast4: f.last4 } : {}),
    ...(open ? (ok ? { status: "processing" } : { status: "failed", errorMessage: f.message || "נדרים פלוס דיווחו על כישלון" }) : {}),
  });
  await appendEvent(row.id, "callback", ok ? "התקבל CallBack מנדרים פלוס" : `CallBack: כישלון – ${f.message ?? ""}`, {
    status: f.status,
    transactionId: f.transactionId,
    amount: f.amount,
  });
  if (!ok) return { ok: true as const, status: "failed" };
  return verifyAndSettle(row.id, { report: { ok: true, amount: f.amount, fromCallback: true, message: f.message }, cfg });
}

type ApiCheck = { available: boolean; matched: boolean; reason: string; row: Record<string, unknown> | null };

/** אימות מול היסטוריית נדרים פלוס. כשל רשת = available:false (לא "לא נמצא"). קריאה אחת ל-API (מוגבל ל-20 בשעה). */
export async function verifyAgainstNedarim(intent: NedarimPayment, cfg: NedarimConfig): Promise<ApiCheck> {
  if (!cfg.hasApiPassword) return { available: false, matched: false, reason: "אין מפתח API (NEDARIM_API_PASSWORD)", row: null };
  const mosadId = intent.mosadId || cfg.mosadId;
  if (!mosadId) return { available: false, matched: false, reason: "אין קוד מוסד", row: null };
  try {
    const tid = intent.transactionId && /^\d+$/.test(intent.transactionId) ? Number(intent.transactionId) : null;
    // GetHistoryJson עולה לפי TransactionId: עם מזהה ידוע מתחילים שורה לפניו; בלעדיו לוקחים חלון גדול של האחרונות
    const params = tid ? { lastId: Math.max(0, tid - 1), maxId: 50 } : { maxId: 500 };
    const { json } = await getTransactionHistory({ mosadId, ...params });
    const rows = Array.isArray(json)
      ? json
      : json && typeof json === "object" && Array.isArray((json as { Data?: unknown }).Data)
        ? (json as { Data: unknown[] }).Data
        : null;
    if (!rows) return { available: false, matched: false, reason: "תשובה לא צפויה מנדרים פלוס", row: null };
    const m = matchHistoryRow(rows, {
      transactionId: intent.transactionId,
      amountAgorot: intent.amount,
      reference: intent.reference,
    });
    return { available: true, matched: m.matched, reason: m.reason, row: m.row };
  } catch (e) {
    return { available: false, matched: false, reason: `שגיאת רשת באימות: ${e instanceof Error ? e.message : String(e)}`, row: null };
  }
}

export type SettleResult =
  | { ok: true; status: string; verified: boolean; reason: string; purchaseId?: number | null }
  | { ok: false; error: string };

/**
 * הלב: מאמת (אם אפשר) ומשלים. options: { report, cfg, manualById, simulated }.
 */
export async function verifyAndSettle(
  id: number,
  opts: {
    report?: { ok: boolean | null; amount: number | null; fromCallback: boolean; message?: string | null } | null;
    cfg: NedarimConfig;
    manualById?: number | null;
    simulated?: boolean;
  },
): Promise<SettleResult> {
  const { report = null, cfg, manualById = null, simulated = false } = opts;
  const intent = await getById(id);
  if (!intent) return { ok: false, error: "בקשה לא נמצאה" };
  if (intent.status === "paid") return { ok: true, status: "paid", verified: intent.verified, reason: "כבר הושלם", purchaseId: intent.purchaseId };

  let decision: SettlementDecision;
  if (manualById) {
    decision = { action: "settle", verified: true, method: "manual", reason: "אישור ידני" };
  } else {
    const api = simulated ? null : await verifyAgainstNedarim(intent, cfg);
    if (api && api.available) {
      await appendEvent(
        intent.id,
        api.matched ? "verify_ok" : "verify_failed",
        api.matched ? "אומת מול היסטוריית נדרים פלוס" : api.reason,
        api.row,
      );
    } else if (api && !api.available && cfg.hasApiPassword) {
      await appendEvent(intent.id, "verify_error", api.reason);
    }
    decision = decideSettlement({ intent, api, report, trustCallback: cfg.trustCallback, simulated });
    if (api?.row) {
      const r = api.row;
      const str = (k: string) => (r[k] === undefined || r[k] === null ? "" : String(r[k]));
      const patch: Partial<typeof nedarimPayments.$inferInsert> = {};
      if (!intent.transactionId && str("TransactionId")) patch.transactionId = str("TransactionId").slice(0, 40);
      if (!intent.confirmation && str("Confirmation")) patch.confirmation = str("Confirmation").slice(0, 40);
      if (!intent.cardLast4 && str("LastNum")) patch.cardLast4 = str("LastNum").replace(/\D/g, "").slice(-4) || null;
      if (Object.keys(patch).length) await touch(intent.id, patch);
    }
  }

  if (decision.action === "fail") {
    await touch(intent.id, { status: "failed", errorMessage: decision.reason.slice(0, 500) });
    await appendEvent(intent.id, "error", decision.reason);
    return { ok: true, status: "failed", verified: false, reason: decision.reason };
  }
  if (decision.action !== "settle") {
    if (decision.action === "wait") {
      await touch(intent.id, {
        ...(intent.status === "pending" ? { status: "processing" } : {}),
        errorMessage: decision.reason.slice(0, 500),
      });
    }
    const fresh = await getById(intent.id);
    return { ok: true, status: fresh?.status ?? intent.status, verified: false, reason: decision.reason };
  }

  return settle(intent, decision, manualById);
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

/**
 * ההשלמה עצמה: תפיסה אטומית של הבקשה (UPDATE מותנה), ואז שורות purchases + תנועה כספית + קופון + מייל.
 * כישלון אחרי התפיסה מחזיר את הבקשה ל-processing עם הודעת שגיאה (המנהלת תראה "אמת מחדש").
 */
async function settle(intent: NedarimPayment, decision: SettlementDecision, byId: number | null): Promise<SettleResult> {
  const paidAt = new Date();
  const claimed = await db
    .update(nedarimPayments)
    .set({
      status: "paid",
      verified: decision.verified,
      verifyMethod: decision.method,
      paidAt,
      settledById: byId,
      errorMessage: null,
      updatedAt: paidAt,
    })
    .where(and(eq(nedarimPayments.id, intent.id), inArray(nedarimPayments.status, [...OPEN_STATUSES])))
    .returning({ id: nedarimPayments.id });
  if (!claimed.length) {
    const fresh = await getById(intent.id);
    return { ok: true, status: fresh?.status ?? "paid", verified: fresh?.verified ?? false, reason: "כבר טופל", purchaseId: fresh?.purchaseId };
  }

  try {
    const prices = await getPlanPrices();
    const rows = buildPurchaseRows(intent, prices);
    const inserted = await db.insert(purchases).values(rows).returning({ id: purchases.id });
    const purchaseId = inserted[0]?.id ?? null;
    await touch(intent.id, { purchaseId });

    const [user] = await db.select().from(users).where(eq(users.id, intent.userId)).limit(1);
    const description = describeIntent(intent);
    const noteParts = [`תשלום דרך נדרים פלוס ${intent.reference}`, description];
    if (intent.transactionId) noteParts.push(`עסקה ${intent.transactionId}`);
    if (intent.confirmation) noteParts.push(`אישור ${intent.confirmation}`);
    if (decision.method === "manual") noteParts.push("אושר ידנית");
    if (decision.method === "simulated") noteParts.push("סימולציה");
    try {
      await db.insert(transactions).values({
        userId: intent.userId,
        purchaseId,
        type: decision.method === "manual" ? "manual" : "charge",
        amount: intent.amount,
        method: decision.method === "simulated" ? "nedarim-sim" : "nedarim",
        reference: intent.reference,
        note: noteParts.join(" | ").slice(0, 500),
        createdById: byId,
      });
    } catch (e) {
      console.error("[nedarim] transaction insert failed", e);
      await appendEvent(intent.id, "error", `רישום התנועה הכספית נכשל: ${e instanceof Error ? e.message : String(e)}`);
    }

    // קופון הנחה פרטי: נתפס עכשיו (ולא ביצירת הבקשה) – בקשה שלא שולמה לא "שורפת" אותו
    if (intent.couponId) {
      const got = await db
        .update(privateCoupons)
        .set({ status: "used", usedAt: paidAt, claimedBy: intent.userId })
        .where(and(eq(privateCoupons.id, intent.couponId), eq(privateCoupons.status, "active")))
        .returning({ id: privateCoupons.id });
      if (!got.length) await appendEvent(intent.id, "coupon_warn", "הקופון כבר נוצל/בוטל בינתיים – ההנחה כבר ניתנה בתשלום");
    }

    await appendEvent(intent.id, decision.method === "manual" ? "manual_settle" : "settled", `הושלם (${decision.method}) – נוצר מנוי`, {
      purchaseId,
      rows: rows.length,
      byId,
    });
    await logAudit({
      actorId: byId ?? intent.userId,
      action: decision.method === "manual" ? "purchase.nedarim_manual" : "purchase.nedarim",
      entityType: "purchase",
      entityId: purchaseId,
      details: {
        reference: intent.reference,
        plan: intent.plan,
        amount: intent.amount,
        verified: decision.verified,
        method: decision.method,
        transactionId: intent.transactionId,
        categoryIds: parseCategoryIds(intent),
      },
    });

    if (user) {
      const t = templates.purchase(user.name, description, formatPrice(intent.amount), rows[0]?.endsAt ?? null);
      const send = () => sendMail({ to: user.email, ...t, kind: "purchase", userId: user.id }).catch((e) => console.error("[nedarim] mail", e));
      try {
        after(send); // ממשיך אחרי התשובה (Vercel waitUntil) – לא מעכב את המורה / את נדרים
      } catch {
        void send(); // מחוץ להקשר בקשה (סקריפט)
      }
    }
    return { ok: true, status: "paid", verified: decision.verified, reason: decision.reason, purchaseId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[nedarim] settle failed after claim", msg);
    await touch(intent.id, { status: "processing", verifyMethod: null, paidAt: null, errorMessage: `ההשלמה נכשלה: ${msg}`.slice(0, 500) });
    await appendEvent(intent.id, "error", `ההשלמה נכשלה אחרי האימות: ${msg}`);
    return { ok: false, error: `ההשלמה נכשלה: ${msg}` };
  }
}

/** אישור ידני ממסך הניהול (אחרי שהמנהלת ראתה את התשלום בפורטל נדרים / קיבלה אותו בדרך אחרת) */
export const manualSettle = (id: number, adminId: number, cfg: NedarimConfig) => verifyAndSettle(id, { cfg, manualById: adminId });

/** ניסיון אימות חוזר מול ה-API (כפתור "אמת מחדש") */
export async function reverify(id: number, cfg: NedarimConfig) {
  const intent = await getById(id);
  if (!intent) return { ok: false as const, error: "בקשה לא נמצאה" };
  await appendEvent(id, "retry", "אימות חוזר ממסך הניהול");
  return verifyAndSettle(id, { report: { ok: true, amount: intent.amount, fromCallback: false }, cfg });
}

export async function cancelIntent(id: number, adminId: number, reason = "") {
  const intent = await getById(id);
  if (!intent) return { ok: false as const, error: "בקשה לא נמצאה" };
  if (intent.status === "paid") {
    return { ok: false as const, error: "בקשה שהושלמה אינה ניתנת לביטול מכאן – לזיכוי: ביטול/זיכוי המנוי ב«מנויים» וזיכוי בפורטל נדרים" };
  }
  await touch(id, { status: "cancelled", settledById: adminId, errorMessage: reason ? reason.slice(0, 500) : intent.errorMessage });
  await appendEvent(id, "cancelled", `בוטל ידנית${reason ? `: ${reason}` : ""}`, { adminId });
  return { ok: true as const, status: "cancelled" };
}

/** המורה ביקשה להשלים דרך המנהלת (טופס נדרים לא נטען – נטפרי וכד'): סימון + מייל למנהלת */
export async function requestAssist(row: NedarimPayment, adminMail: string | null) {
  if (!OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number])) {
    return { ok: false as const, error: "הבקשה כבר אינה פתוחה" };
  }
  const already = !!row.assistRequestedAt;
  if (!already) await touch(row.id, { assistRequestedAt: new Date() });
  await appendEvent(row.id, "assist", already ? "בקשת סיוע חוזרת" : "המורה ביקשה להשלים את התשלום דרך המנהלת (טופס נדרים לא נטען)");
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
      const send = () => sendMail({ to: adminMail, ...t, kind: "pay_assist", userId: user.id }).catch((e) => console.error("[nedarim] assist mail", e));
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
