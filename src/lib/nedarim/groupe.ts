import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { privateCoupons } from "@/db/schema";
import { getPlanPrices } from "@/lib/pricing";
import { getNedarimApiPassword, redactNedarim } from "./secrets";
import { GROUPE_NAMES, PAYABLE_ITEM_KINDS, PAYABLE_PLANS, type PayKey } from "./logic";
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

/**
 * מחירי המסלולים כפי שנגבים ב-/api/pay/intent (getPlanPrices – מחיר השקה/הגדרות), בשמות הקטגוריות בנדרים; ואחריהם שתי
 * קטגוריות הפריטים (הורדה בודדת / קובץ מורחב) – מחיר משתנה (priceAgorot = null): רק צריכות להתקיים, בלי סכום מינימלי.
 */
export async function planPriceRows(): Promise<{ plan: PayKey; name: string; priceAgorot: number | null }[]> {
  const prices = await getPlanPrices();
  return [
    ...PAYABLE_PLANS.map((plan) => ({ plan: plan as PayKey, name: GROUPE_NAMES[plan], priceAgorot: prices.plans[plan] as number | null })),
    ...PAYABLE_ITEM_KINDS.map((plan) => ({ plan: plan as PayKey, name: GROUPE_NAMES[plan], priceAgorot: null })),
  ];
}

/** מצב הסנכרון (בלי לשנות דבר) */
export async function planSyncStatus(categories: NedarimCategory[], maxDiscountPercent: number): Promise<SyncPlanRow[]> {
  return planSyncRows(categories, await planPriceRows(), maxDiscountPercent);
}

export type SyncAction = { plan: PayKey; name: string; action: "created" | "updated" | "unchanged"; amountAgorot: number | null };

/**
 * "סנכרן סכומים עם מחירי האתר": לכל מסלול – הקטגוריה לפי שם (נוצרת אם חסרה), Amount = המינימום (מחיר, או אחרי ההנחה
 * המקסימלית שמאפשרים); לקטגוריות הפריטים (מחיר משתנה) – יצירה בלי Amount אם חסרות, אחרת ללא שינוי. רק בלחיצה.
 */
export async function syncPlanAmounts(maxDiscountPercent: number): Promise<SyncAction[]> {
  const c = await client();
  const categories = await c.list();
  const rows = planSyncRows(categories, await planPriceRows(), maxDiscountPercent);
  const out: SyncAction[] = [];
  for (const r of rows) {
    const plan = r.plan as PayKey;
    if (r.inSync && r.category) {
      out.push({ plan, name: r.name, action: "unchanged", amountAgorot: r.targetAgorot });
      continue;
    }
    await c.save(r.category, { name: r.category?.name ?? r.name, amount: r.targetAgorot });
    out.push({ plan, name: r.name, action: r.category ? "updated" : "created", amountAgorot: r.targetAgorot });
  }
  return out;
}
