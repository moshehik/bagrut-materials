import "server-only";
import { and, eq, gt, gte, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { downloads, materials, purchases } from "@/db/schema";
import { getDescendantIds } from "@/lib/data";

type Purchase = typeof purchases.$inferSelect;

const SUBSCRIPTION_PLANS: Purchase["plan"][] = ["subject_monthly", "custom_monthly", "yearly"];

/** מפתח הזמנה: שורות שנוצרו באותו תשלום חולקות paymentRef; שורה בלי paymentRef היא הזמנה לעצמה */
export function orderKey(p: Pick<Purchase, "id" | "paymentRef">) {
  return p.paymentRef ? `ref:${p.paymentRef}` : `id:${p.id}`;
}

/** האם עדיין לא נעשה שימוש בשורת הרכישה (לא הורדה אחרי הרכישה) */
async function isUnused(userId: number, p: Purchase): Promise<boolean> {
  if (SUBSCRIPTION_PLANS.includes(p.plan)) return p.downloadsUsed === 0;
  if (p.plan === "single" && p.materialId) {
    const hit = await db
      .select({ id: downloads.id })
      .from(downloads)
      .where(and(eq(downloads.userId, userId), eq(downloads.materialId, p.materialId), gte(downloads.createdAt, p.createdAt)))
      .limit(1);
    return hit.length === 0;
  }
  if (p.plan === "bundle" && p.categoryId) {
    const catIds = await getDescendantIds(p.categoryId);
    if (!catIds.length) return true;
    const hit = await db
      .select({ id: downloads.id })
      .from(downloads)
      .innerJoin(materials, eq(downloads.materialId, materials.id))
      .where(and(eq(downloads.userId, userId), inArray(materials.categoryId, catIds), gte(downloads.createdAt, p.createdAt)))
      .limit(1);
    return hit.length === 0;
  }
  // פרימיום בלבד – אין בו הורדות
  return true;
}

export type OrderCancelInfo = {
  /** מזהי כל שורות ההזמנה הפעילות */
  rowIds: number[];
  /** סכום ההזמנה כולה באגורות */
  total: number;
  /** אפשר לבטל ולקבל החזר מלא – לא הורדו קבצים בהזמנה */
  eligible: boolean;
};

/** לכל הזמנה פעילה של המשתמשת: האם אפשר לבטל אותה (לפי orderKey) */
export async function getOrderCancelInfo(userId: number): Promise<Map<string, OrderCancelInfo>> {
  const rows = await db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.status, "active"),
        or(isNull(purchases.endsAt), gt(purchases.endsAt, new Date())),
      ),
    );
  const groups = new Map<string, Purchase[]>();
  for (const p of rows) {
    const k = orderKey(p);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const out = new Map<string, OrderCancelInfo>();
  for (const [k, group] of groups) {
    const unused = await Promise.all(group.map((p) => isUnused(userId, p)));
    out.set(k, {
      rowIds: group.map((p) => p.id),
      total: group.reduce((s, p) => s + p.amount, 0),
      eligible: unused.every(Boolean),
    });
  }
  return out;
}
