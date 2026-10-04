import "server-only";
import type { Plan } from "@/db/schema";
import {
  PLANS,
  PREMIUM_ADDON_PRICE,
  YEARLY_LIST_PRICE_MONTHLY,
  YEARLY_EXTRA_SUBJECT_PRICE,
  SUBSTITUTE_PRICE_MONTHLY,
  SUBSTITUTE_LAUNCH_PRICE_MONTHLY,
  SUBSTITUTE_DAILY_DOWNLOADS,
  SUBSTITUTE_DAILY_PRICE,
  SUBSTITUTE_DAILY_LAUNCH_PRICE,
} from "./constants";
import { getNumber } from "./settings";

export type PlanPrices = {
  /** מחיר לכל מסלול באגורות (single/bundle = 0 – נקבעים לפי החומר/תיקייה) */
  plans: Record<Plan, number>;
  /** תוסף פרימיום לחודש באגורות */
  premiumAddon: number;
  /** מחיר ברירת מחדל להורדה בודדת באגורות */
  defaultSingle: number;
  /** מחיר מחירון חודשי של המנוי השנתי (מוצג מחוק) */
  yearlyListMonthly: number;
  /** תוספת מקצוע למנוי שנתי, לחודש (× 12) */
  yearlyExtraSubject: number;
  /** ממלאת מקום 3 חודשים: מחירון / השקה, לחודש */
  substituteMonthly: number;
  substituteLaunchMonthly: number;
  /** ממלאת מקום יומית (סל הורדות בלי הגבלת זמן): מחירון / מבצע / מספר הורדות */
  substituteDaily: number;
  substituteDailyLaunch: number;
  substituteDailyDownloads: number;
};

function toAgorot(shekels: number, fallback: number) {
  return Number.isFinite(shekels) && shekels >= 0 ? Math.round(shekels * 100) : fallback;
}

/** מחירי המסלולים – ברירות המחדל מ-constants, עם דריסה מההגדרות (price_*) */
export async function getPlanPrices(): Promise<PlanPrices> {
  const [subject, custom, yearly, addon, single, listMonthly, extraSubject, subMonthly, subLaunch, daily, dailyLaunch, dailyDownloads] =
    await Promise.all([
      getNumber("price_subject_monthly"),
      getNumber("price_custom_monthly"),
      getNumber("price_yearly"),
      getNumber("price_premium_addon"),
      getNumber("default_single_price"),
      getNumber("yearly_list_price_monthly"),
      getNumber("yearly_extra_subject_price"),
      getNumber("substitute_price_monthly"),
      getNumber("substitute_launch_price_monthly"),
      getNumber("substitute_daily_price"),
      getNumber("substitute_daily_launch_price"),
      getNumber("substitute_daily_downloads"),
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
    yearlyListMonthly: toAgorot(listMonthly, YEARLY_LIST_PRICE_MONTHLY),
    yearlyExtraSubject: toAgorot(extraSubject, YEARLY_EXTRA_SUBJECT_PRICE),
    substituteMonthly: toAgorot(subMonthly, SUBSTITUTE_PRICE_MONTHLY),
    substituteLaunchMonthly: toAgorot(subLaunch, SUBSTITUTE_LAUNCH_PRICE_MONTHLY),
    substituteDaily: toAgorot(daily, SUBSTITUTE_DAILY_PRICE),
    substituteDailyLaunch: toAgorot(dailyLaunch, SUBSTITUTE_DAILY_LAUNCH_PRICE),
    substituteDailyDownloads:
      Number.isFinite(dailyDownloads) && dailyDownloads > 0 ? Math.round(dailyDownloads) : SUBSTITUTE_DAILY_DOWNLOADS,
  };
}
