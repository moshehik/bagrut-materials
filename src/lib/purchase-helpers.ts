import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { materials, type Category, type Plan } from "@/db/schema";
import { PLANS, bundlePriceFor } from "./constants";
import { getDescendantIds } from "./data";
import type { PlanPrices } from "./pricing";

export function addDays(days: number, from: Date = new Date()) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** מסלולי מנוי שהתוקף שלהם מתחיל בהורדה הראשונה ולא ברכישה (ר' purchases.termDays) */
export const FIRST_USE_PLANS: Plan[] = ["subject_monthly", "custom_monthly", "yearly", "substitute_3m"];

/** תוקף שורת רכישה חדשה: מנוי שמתחיל בהורדה הראשונה – endsAt ריק + termDays; אחרת תאריך סיום מהיום */
export function termFields(plan: Plan, days: number): { endsAt: Date | null; termDays: number | null } {
  return FIRST_USE_PLANS.includes(plan) ? { endsAt: null, termDays: days } : { endsAt: addDays(days), termDays: null };
}

/*
 * חישובי מחיר משותפים לקופה (purchaseAction) ולעגלה (getCart / checkoutCart) – מקור אמת אחד,
 * כדי שהעגלה לעולם לא תהיה זולה מהרכישה הישירה: מחירי המסלולים מההגדרות (getPlanPrices)
 * ומחיר תיקייה לפי bundlePriceFor (מחיר ידני / 15 ש"ח ליחידה / 70% מסכום החומרים).
 */

/** מחיר קובץ מורחב לתיקייה – בדיוק כמו ב-purchaseAction */
export async function bundleAmountFor(c: Pick<Category, "id" | "bundlePrice">): Promise<number> {
  const ids = await getDescendantIds(c.id);
  const ms = ids.length
    ? await db.select({ price: materials.price }).from(materials).where(inArray(materials.categoryId, ids))
    : [];
  return bundlePriceFor({
    bundlePrice: c.bundlePrice,
    isLeaf: ids.length <= 1,
    materialsTotal: ms.reduce((s, x) => s + x.price, 0),
  });
}

export type SubscriptionPlan = Exclude<Plan, "single" | "bundle">;

/** מחיר מסלול מנוי, תוקף ומכסה – בדיוק כמו ב-purchaseAction */
export function planAmountFor(plan: SubscriptionPlan, prices: PlanPrices) {
  const def = PLANS[plan];
  const days = def.days ?? 30;
  const months = Math.max(1, Math.round(days / 30));
  const base = prices.plans[plan];
  return {
    base,
    months,
    days,
    total: base,
    downloadsLimit: def.downloadsLimit ?? null,
  };
}
