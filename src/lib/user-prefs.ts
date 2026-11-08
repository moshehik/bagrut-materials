import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { clampFillLinePercent, FILL_LINE_PERCENT_DEFAULT, fillLinePercentToScale } from "@/lib/fill-line-pref";

/**
 * קריאה/כתיבה של ההגדרות האישיות של מורה (טבלת user_preferences). הקריאה לעולם לא זורקת: טבלה שעוד לא נוצרה / DB
 * שנתקע / שורה חסרה = ברירת המחדל, כך שהורדה לא נופלת בגלל הגדרה. (בלי "server-only" בכוונה - נוח לסקריפטים.)
 */

/** אחוז קווי-המילוי של המורה (100 = בלי שינוי). */
export async function getFillLinePercent(userId: number | null | undefined): Promise<number> {
  if (!userId) return FILL_LINE_PERCENT_DEFAULT;
  try {
    const [row] = await db
      .select({ p: userPreferences.fillLinePercent })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    return clampFillLinePercent(row?.p);
  } catch (e) {
    console.warn("[user-prefs] קריאת הגדרת קווי-המילוי נכשלה, ברירת מחדל:", e instanceof Error ? e.message : e);
    return FILL_LINE_PERCENT_DEFAULT;
  }
}

/** המקדם שמועבר להמרה (convertOfficeToPdfCached → fillScale): 1 = בלי שינוי. */
export async function getFillLineScale(userId: number | null | undefined): Promise<number> {
  return fillLinePercentToScale(await getFillLinePercent(userId));
}

/** שומרת (upsert) את הגדרת קווי-המילוי; הערך מנורמל לצעד/טווח. זורקת אם הכתיבה נכשלה (הקורא מציג שגיאה). */
export async function setFillLinePercent(userId: number, percent: unknown): Promise<number> {
  const value = clampFillLinePercent(percent);
  await db
    .insert(userPreferences)
    .values({ userId, fillLinePercent: value })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { fillLinePercent: value, updatedAt: new Date() } });
  return value;
}
