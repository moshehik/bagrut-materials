import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, sichot } from "@/db/schema";
import { sichaAccessEnd } from "./sicha-access-calc";

/**
 * למי יש גישה לחומרי איזה מקצוע בזכות שיחות שהעלתה: Map<rootCategoryId, תאריך סיום>.
 * נשמר בזיכרון ה-instance 30 שניות לכל מורה (checkEntitlement נקרא לכל חומר ברשימה);
 * invalidateSichaAccess מנקה מיד אחרי העלאה באותו instance.
 */
const TTL_MS = 30_000;
const cache = new Map<number, { at: number; ends: Map<number, Date> }>();

export function invalidateSichaAccess(userId: number) {
  cache.delete(userId);
}

async function rootOf(categoryId: number, memo: Map<number, number>): Promise<number> {
  const known = memo.get(categoryId);
  if (known !== undefined) return known;
  let id = categoryId;
  for (let i = 0; i < 12; i++) {
    const [row] = await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, id)).limit(1);
    if (!row || row.parentId === null) break;
    id = row.parentId;
  }
  memo.set(categoryId, id);
  return id;
}

export async function getSichaAccessEnds(userId: number): Promise<Map<number, Date>> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ends;

  const rows = await db
    .select({ categoryId: sichot.categoryId, createdAt: sichot.createdAt })
    .from(sichot)
    .where(and(eq(sichot.teacherId, userId), eq(sichot.status, "active")));

  const memo = new Map<number, number>();
  const byRoot = new Map<number, Date[]>();
  for (const r of rows) {
    const root = await rootOf(r.categoryId, memo);
    const list = byRoot.get(root) ?? [];
    list.push(r.createdAt);
    byRoot.set(root, list);
  }
  const ends = new Map<number, Date>();
  for (const [root, dates] of byRoot) {
    const end = sichaAccessEnd(dates);
    if (end) ends.set(root, end);
  }
  cache.set(userId, { at: Date.now(), ends });
  return ends;
}

/** האם יש למורה גישה פעילה לחומרי המקצוע (קטגוריית שורש) הזה בזכות שיחות שהעלתה */
export async function hasSichaAccess(userId: number, rootCategoryId: number): Promise<boolean> {
  const ends = await getSichaAccessEnds(userId);
  const end = ends.get(rootCategoryId);
  return !!end && end.getTime() > Date.now();
}

export async function sichaAccessEndFor(userId: number, rootCategoryId: number): Promise<Date | null> {
  const end = (await getSichaAccessEnds(userId)).get(rootCategoryId);
  return end && end.getTime() > Date.now() ? end : null;
}
