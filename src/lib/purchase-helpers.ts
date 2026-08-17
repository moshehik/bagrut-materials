import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type Plan, type Tier } from "@/db/schema";
import { TIERS } from "./constants";

export function addDays(days: number, from: Date = new Date()) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** מדרג הפרימיום לפי סוג הרכישה */
export function premiumTierFor(kind: string, plan?: Plan): Tier {
  if (kind === "plan" && plan === "yearly") return "gold";
  if (kind === "plan" && plan === "custom_monthly") return "silver";
  if (kind === "plan" && plan === "subject_monthly") return "copper";
  return "iron"; // single / bundle / premium בלבד
}

/** מדרג פרימיום לפי מסלול (למנוי ידני) */
export function premiumTierForPlan(plan: Plan): Tier {
  if (plan === "single" || plan === "bundle") return "iron";
  return premiumTierFor("plan", plan);
}

/** מעלה את דרגת המשתמשת אם היעד גבוה מהנוכחית */
export async function raiseTier(userId: number, current: Tier, target: Tier) {
  if (TIERS[target].order <= TIERS[current].order) return;
  await db.update(users).set({ tier: target }).where(eq(users.id, userId));
}
