import "server-only";
import type { Plan } from "@/db/schema";
import { PLANS, PREMIUM_ADDON_PRICE } from "./constants";
import { getNumber } from "./settings";

export type PlanPrices = {
  /** מחיר לכל מסלול באגורות (single/bundle = 0 – נקבעים לפי החומר/תיקייה) */
  plans: Record<Plan, number>;
  /** תוסף פרימיום לחודש באגורות */
  premiumAddon: number;
  /** מחיר ברירת מחדל להורדה בודדת באגורות */
  defaultSingle: number;
};

function toAgorot(shekels: number, fallback: number) {
  return Number.isFinite(shekels) && shekels >= 0 ? Math.round(shekels * 100) : fallback;
}

/** מחירי המסלולים – ברירות המחדל מ-constants, עם דריסה מההגדרות (price_*) */
export async function getPlanPrices(): Promise<PlanPrices> {
  const [subject, custom, yearly, addon, single] = await Promise.all([
    getNumber("price_subject_monthly"),
    getNumber("price_custom_monthly"),
    getNumber("price_yearly"),
    getNumber("price_premium_addon"),
    getNumber("default_single_price"),
  ]);
  return {
    plans: {
      single: 0,
      bundle: 0,
      subject_monthly: toAgorot(subject, PLANS.subject_monthly.price ?? 0),
      custom_monthly: toAgorot(custom, PLANS.custom_monthly.price ?? 0),
      yearly: toAgorot(yearly, PLANS.yearly.price ?? 0),
    },
    premiumAddon: toAgorot(addon, PREMIUM_ADDON_PRICE),
    defaultSingle: toAgorot(single, 1500),
  };
}
