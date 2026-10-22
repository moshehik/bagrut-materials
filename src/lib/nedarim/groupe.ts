import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { privateCoupons } from "@/db/schema";
import { getPlanPrices } from "@/lib/pricing";
import { getNedarimApiPassword, redactNedarim } from "./secrets";
import { PAYABLE_PLANS, PLAN_GROUPE_NAMES, type PayablePlan } from "./logic";
import { createGroupeClient, planSyncRows, type NedarimCategory, type SyncPlanRow } from "./groupe-logic";

/**
 * קטגוריות המוסד בנדרים פלוס (Groupe) – עטיפת שרת מעל groupe-logic.ts: מפתח npk_ מ-getNedarimApiPassword (DB/env), קוד מוסד
 * מ-NEDARIM_MOSAD_ID, timeout, redirect:"error", redactNedarim על כל שגיאה. אין polling – נקרא רק מטעינת הכרטיס באדמין
 * ומלחיצות. docs/nedarim-payments.md
 */
async function client() {
  const mosadId = (process.env.NEDARIM_MOSAD_ID ?? "").trim();
  const apiPassword = await getNedarimApiPassword();
  if (!mosadId) throw new Error("קוד מוסד (NEDARIM_MOSAD_ID) חסר");
  if (!apiPassword) throw new Error("מפתח ה-API של נדרים אינו מוגדר");
  return createGroupeClient({ fetchImpl: (url, init) => fetch(url, init), mosadId, apiPassword, redact: redactNedarim });
}

export async function listCategories(): Promise<NedarimCategory[]> {
  return (await client()).list();
}

/** יצירה (id ריק) או עדכון (id קיים): קורא קודם את הרשימה ומשלב, כדי לא לאבד שדות שלא נשלחו */
export async function saveCategory(input: { id: number | null; name: string; amount: number | null; goal: number | null; cumule?: number | null }): Promise<{ id: number | null; created: boolean }> {
  const c = await client();
  let existing: NedarimCategory | null = null;
  if (input.id) {
    existing = (await c.list()).find((x) => x.id === input.id) ?? null;
    if (!existing) throw new Error("הקטגוריה לא נמצאה בנדרים (אולי נמחקה) – לרענן");
  }
  const id = await c.save(existing, { name: input.name, amount: input.amount, goal: input.goal, ...(input.cumule !== undefined ? { cumule: input.cumule } : {}) });
  return { id, created: !existing };
}

export async function deleteCategory(id: number): Promise<void> {
  await (await client()).remove(id);
}

/** אחוז ההנחה הגבוה ביותר בקופון פרטי פעיל (כל המשתמשות) – לחישוב המינימום הבטוח */
export async function getMaxActiveCouponPercent(): Promise<number> {
  try {
    const [r] = await db
      .select({ m: sql<number>`coalesce(max(${privateCoupons.percent}), 0)::int` })
      .from(privateCoupons)
      .where(and(eq(privateCoupons.status, "active"), eq(privateCoupons.benefit, "percent"), or(isNull(privateCoupons.expiresAt), gt(privateCoupons.expiresAt, sql`now()`))));
    return Math.min(100, Math.max(0, Number(r?.m ?? 0)));
  } catch {
    return 0;
  }
}

/** מחירי המסלולים כפי שנגבים ב-/api/pay/intent (getPlanPrices – מחיר השקה/הגדרות), בשמות הקטגוריות בנדרים */
export async function planPriceRows(): Promise<{ plan: PayablePlan; name: string; priceAgorot: number }[]> {
  const prices = await getPlanPrices();
  return PAYABLE_PLANS.map((plan) => ({ plan, name: PLAN_GROUPE_NAMES[plan], priceAgorot: prices.plans[plan] }));
}

/** מצב הסנכרון (בלי לשנות דבר) */
export async function planSyncStatus(categories: NedarimCategory[], maxDiscountPercent: number): Promise<SyncPlanRow[]> {
  return planSyncRows(categories, await planPriceRows(), maxDiscountPercent);
}

/**
 * "סנכרן סכומים עם מחירי האתר": לכל מסלול – הקטגוריה לפי שם (נוצרת אם חסרה), Amount = המינימום (מחיר, או אחרי ההנחה
 * המקסימלית שמאפשרים). רק בלחיצה. מחזיר מה נעשה לכל מסלול.
 */
export async function syncPlanAmounts(maxDiscountPercent: number): Promise<{ plan: PayablePlan; name: string; action: "created" | "updated" | "unchanged"; amountAgorot: number }[]> {
  const c = await client();
  const categories = await c.list();
  const rows = planSyncRows(categories, await planPriceRows(), maxDiscountPercent);
  const out: { plan: PayablePlan; name: string; action: "created" | "updated" | "unchanged"; amountAgorot: number }[] = [];
  for (const r of rows) {
    if (r.inSync && r.category) {
      out.push({ plan: r.plan as PayablePlan, name: r.name, action: "unchanged", amountAgorot: r.targetAgorot });
      continue;
    }
    await c.save(r.category, { name: r.category?.name ?? r.name, amount: r.targetAgorot });
    out.push({ plan: r.plan as PayablePlan, name: r.name, action: r.category ? "updated" : "created", amountAgorot: r.targetAgorot });
  }
  return out;
}
