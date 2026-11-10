import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessonGifts } from "@/db/schema";
import { getDescendantIds } from "@/lib/data";

/** רכישות שנוצרו ממימוש שיעור במתנה (purchases.payment_ref) */
export const GIFT_LESSON_REF_PREFIX = "gift-lesson";

/** יתרת שיעורים במתנה. כשל בקריאה (למשל הטבלה עוד לא קיימת) = 0, כדי שדף התשלום לא יישבר */
export async function getGiftCredits(userId: number): Promise<number> {
  try {
    const [r] = await db.select({ credits: lessonGifts.credits }).from(lessonGifts).where(eq(lessonGifts.userId, userId)).limit(1);
    return r?.credits ?? 0;
  } catch {
    return 0;
  }
}

/** שיעור במתנה רק לפרק עצמו (תיקיית עלה), לא לתיקיית-אב שלמה – אחרת "3 שיעורים" היו יכולים לפתוח ספר שלם */
export async function isGiftableFolder(categoryId: number): Promise<boolean> {
  const ids = await getDescendantIds(categoryId);
  return ids.length <= 1;
}
