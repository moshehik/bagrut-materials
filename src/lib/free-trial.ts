import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchases, type User } from "@/db/schema";
import { getBool } from "@/lib/settings";

/**
 * הורדה חינמית אחת לכל מורה, על כל חומר שתבחר.
 * ממומשת כרכישה בודדת של 0 ₪ (purchases.paymentRef = FREE_TRIAL_REF) – כך checkEntitlement וההורדה
 * הקיימים עובדים בלי שינוי, והחומר נשאר "נרכש" אצלה. אין עמודה חדשה בבסיס הנתונים.
 */
export const FREE_TRIAL_REF = "free-trial";

/** off = כבוי/אורחת/מנהלת; used = כבר מומשה; unverified = צריך לאמת מייל קודם; available = אפשר לממש */
export type FreeTrialState = "off" | "used" | "unverified" | "available";

export async function getFreeTrialState(user: User | null): Promise<FreeTrialState> {
  if (!user || user.role === "admin" || user.suspended) return "off";
  if (!(await getBool("free_trial_enabled"))) return "off";

  const [mine] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, user.id), eq(purchases.paymentRef, FREE_TRIAL_REF)))
    .limit(1);
  if (mine) return "used";

  // אותו מספר טלפון כבר מימש הורדה חינמית בחשבון אחר – לא נותנים שנייה
  const digits = (user.phone ?? "").replace(/\D/g, "");
  if (digits) {
    const dup = await db.execute(sql`
      SELECT 1 FROM purchases p JOIN users u ON u.id = p.user_id
      WHERE p.payment_ref = ${FREE_TRIAL_REF}
        AND regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') = ${digits}
      LIMIT 1
    `);
    if (dup.rows.length > 0) return "used";
  }

  if (!user.emailVerified) return "unverified";
  return "available";
}
