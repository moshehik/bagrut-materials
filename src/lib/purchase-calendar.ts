import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { purchases, users } from "@/db/schema";
import { jerusalemIso } from "@/lib/hebrew-date";

/** רכישת מנוי – מוצגת בלוח השנה ביום הרכישה, עם אגוז המסלול */
export type CalPurchase = {
  dateIso: string;
  plan: string;
  /** שם המסלול, למשל "מנוי שנתי" */
  label: string;
  who?: string;
  time: string;
};

/**
 * סוגי הרכישה שמוצגים בלוח – מסלולי האתר: מנוי שנתי, רכישה בודדת (ו"קובץ מורחב" – תיקייה).
 * ממלאת מקום 3 חודשים ו-20 הורדות עדיין לא נשמרים במסד כסוג רכישה נפרד, ולכן לא מוצגים עד שיוגדרו.
 * (custom_monthly / subject_monthly הם סוגים פנימיים ישנים – למשל מענק קופון – ואינם מסלול לקוחה.)
 */
const SHOWN_PLANS = ["yearly", "single", "bundle"] as const;

export const PLAN_CAL_LABEL: Record<string, string> = {
  yearly: "מנוי שנתי",
  single: "הורדה בודדת",
  bundle: "קובץ מורחב",
  substitute: "ממלאת מקום 3 חודשים",
  daily: "ממלאת מקום – 20 הורדות",
};

/** רכישות (מנוי שנתי / הורדה בודדת / קובץ מורחב) בטווח (לא מבוטלות/מוחזרות). userId – של משתמשת אחת; בלי – של כולן, עם שם */
export async function loadPurchaseEvents(opts: { from: Date; to: Date; userId?: number }): Promise<CalPurchase[]> {
  const { from, to, userId } = opts;
  const rows = await db
    .select({
      createdAt: purchases.createdAt,
      plan: purchases.plan,
      userName: users.name,
    })
    .from(purchases)
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(
      and(
        inArray(purchases.plan, [...SHOWN_PLANS]),
        inArray(purchases.status, ["active", "expired"]),
        gte(purchases.createdAt, from),
        lte(purchases.createdAt, to),
        userId ? eq(purchases.userId, userId) : undefined,
      ),
    )
    .orderBy(asc(purchases.createdAt));
  return rows.map((r) => ({
    dateIso: jerusalemIso(r.createdAt),
    plan: r.plan,
    label: PLAN_CAL_LABEL[r.plan] ?? r.plan,
    who: userId ? undefined : r.userName,
    time: r.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }),
  }));
}
