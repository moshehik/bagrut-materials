"use server";

import { and, eq, gt, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonGifts, purchases } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { chainToHref, getCategoryChain } from "@/lib/data";
import { loadPayableItem, itemCoverageFor } from "@/lib/nedarim/items";
import { GIFT_LESSON_REF_PREFIX, isGiftableFolder } from "@/lib/lesson-gifts";

export type GiftLessonResult = { ok: true; href: string } | { ok: false; error: string };

/** מימוש שיעור במתנה: מוריד 1 מהיתרה ויוצר רכישת "קובץ מורחב" של 0 ₪ על תיקיית הפרק (כמו רכישה רגילה) */
export async function redeemGiftLessonAction(categoryId: number): Promise<GiftLessonResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "צריך להתחבר." };
  if (user.suspended) return { ok: false, error: "החשבון מושהה." };
  if (!Number.isInteger(categoryId) || categoryId < 1) return { ok: false, error: "הפרק לא נמצא." };

  const loaded = await loadPayableItem({ kind: "bundle", categoryId });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!(await isGiftableFolder(categoryId))) return { ok: false, error: "שיעור במתנה אפשר לפתוח רק לפרק בודד." };
  if (await itemCoverageFor(user.id, loaded.item)) return { ok: false, error: "הפרק הזה כבר פתוח לך." };

  // הורדה אטומית של יתרה (רק אם נשארה)
  const dec = await db
    .update(lessonGifts)
    .set({ credits: sql`${lessonGifts.credits} - 1`, updatedAt: new Date() })
    .where(and(eq(lessonGifts.userId, user.id), gt(lessonGifts.credits, 0)))
    .returning({ credits: lessonGifts.credits });
  if (!dec.length) return { ok: false, error: "לא נשארו לך שיעורים במתנה." };

  const ref = `${GIFT_LESSON_REF_PREFIX}-${categoryId}`;
  const refund = () =>
    db.update(lessonGifts).set({ credits: sql`${lessonGifts.credits} + 1` }).where(eq(lessonGifts.userId, user.id)).catch(() => {});

  let rowId: number;
  try {
    const [row] = await db
      .insert(purchases)
      .values({
        userId: user.id,
        plan: "bundle",
        materialId: null,
        categoryId,
        amount: 0,
        downloadsLimit: null,
        endsAt: null,
        paymentRef: ref,
        status: "active",
        notes: "שיעור במתנה",
      })
      .returning({ id: purchases.id });
    rowId = row.id;
  } catch {
    await refund();
    return { ok: false, error: "שגיאה בפתיחת השיעור. נסי שוב." };
  }

  // לחיצה כפולה / שתי לשוניות: נשארת רק הרכישה הראשונה של אותו פרק, והיתרה מוחזרת על השנייה
  const same = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, user.id), like(purchases.paymentRef, ref)))
    .orderBy(purchases.id);
  if (same[0] && same[0].id !== rowId) {
    await db.delete(purchases).where(eq(purchases.id, rowId));
    await refund();
    return { ok: false, error: "הפרק הזה כבר נפתח לך." };
  }

  await logAudit({
    actorId: user.id,
    action: "gift_lesson.redeem",
    entityType: "category",
    entityId: categoryId,
    details: { purchaseId: rowId, title: loaded.item.title, creditsLeft: dec[0].credits },
  });

  const chain = await getCategoryChain(categoryId);
  return { ok: true, href: `${chainToHref(chain)}?dlall=1` };
}
