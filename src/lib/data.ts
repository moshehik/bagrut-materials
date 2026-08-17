import "server-only";
import { and, asc, eq, isNull, sql, gt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  materials,
  purchases,
  type Category,
  type Material,
  type User,
} from "@/db/schema";
import { PREMIUM_KINDS, tierAtLeast } from "./constants";

export async function getRootSubjects() {
  return db
    .select()
    .from(categories)
    .where(isNull(categories.parentId))
    .orderBy(asc(categories.sort), asc(categories.id));
}

export async function getChildren(parentId: number) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.parentId, parentId))
    .orderBy(asc(categories.sort), asc(categories.id));
}

export async function getMaterials(categoryId: number) {
  return db
    .select()
    .from(materials)
    .where(eq(materials.categoryId, categoryId))
    .orderBy(asc(materials.sort), asc(materials.id));
}

/** פותר נתיב slugs לרשימת קטגוריות (breadcrumbs). מחזיר null אם לא נמצא. */
export async function resolvePath(slugs: string[]): Promise<Category[] | null> {
  const chain: Category[] = [];
  let parentId: number | null = null;
  for (const slug of slugs) {
    const cond: SQL | undefined =
      parentId === null
        ? and(isNull(categories.parentId), eq(categories.slug, slug))
        : and(eq(categories.parentId, parentId), eq(categories.slug, slug));
    const rows: Category[] = await db.select().from(categories).where(cond).limit(1);
    const c = rows[0];
    if (!c) return null;
    chain.push(c);
    parentId = c.id;
  }
  return chain;
}

export async function getCategoryChain(id: number): Promise<Category[]> {
  const chain: Category[] = [];
  let cur: number | null = id;
  while (cur !== null) {
    const [c] = await db.select().from(categories).where(eq(categories.id, cur)).limit(1);
    if (!c) break;
    chain.unshift(c);
    cur = c.parentId;
  }
  return chain;
}

export function chainToHref(chain: Category[]) {
  return "/subjects/" + chain.map((c) => encodeURIComponent(c.slug)).join("/");
}

/** כל צאצאי הקטגוריה (כולל עצמה) - לחישוב זכאות מנוי למקצוע */
export async function getDescendantIds(rootId: number): Promise<number[]> {
  const rows = await db.execute<{ id: number }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM categories WHERE id = ${rootId}
      UNION ALL
      SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
    )
    SELECT id FROM tree
  `);
  return rows.rows.map((r) => Number(r.id));
}

export async function countMaterialsUnder(rootId: number): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM categories WHERE id = ${rootId}
      UNION ALL
      SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
    )
    SELECT count(*)::int AS n FROM materials WHERE category_id IN (SELECT id FROM tree)
  `);
  return Number(rows.rows[0]?.n ?? 0);
}

export type Entitlement =
  | { ok: true; via: "admin" | "single" | "bundle" | "subscription"; purchaseId?: number }
  | { ok: false; reason: "login" | "premium" | "tier" | "purchase" | "quota" };

/** בודק האם המשתמשת רשאית להוריד את החומר */
export async function checkEntitlement(
  user: User | null,
  material: Material,
): Promise<Entitlement> {
  if (!user) return { ok: false, reason: "login" };
  if (user.role === "admin") return { ok: true, via: "admin" };

  const isPremiumKind = material.premiumOnly || PREMIUM_KINDS.includes(material.kind);
  const now = new Date();

  const active = await db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, user.id),
        or(isNull(purchases.endsAt), gt(purchases.endsAt, now)),
      ),
    );

  const hasPremium = active.some((p) => p.premium);
  if (isPremiumKind && !hasPremium) return { ok: false, reason: "premium" };
  if (!tierAtLeast(user.tier, material.minTier)) return { ok: false, reason: "tier" };

  // רכישה בודדת של החומר עצמו
  const single = active.find((p) => p.plan === "single" && p.materialId === material.id);
  if (single) return { ok: true, via: "single", purchaseId: single.id };

  // רכישת תיקייה מורחבת שמכילה את החומר
  const chain = await getCategoryChain(material.categoryId);
  const chainIds = new Set(chain.map((c) => c.id));
  const bundle = active.find(
    (p) => p.plan === "bundle" && p.categoryId !== null && chainIds.has(p.categoryId),
  );
  if (bundle) return { ok: true, via: "bundle", purchaseId: bundle.id };

  // מנויים
  const subs = active.filter((p) =>
    ["subject_monthly", "custom_monthly", "yearly"].includes(p.plan),
  );
  for (const s of subs) {
    const inScope =
      s.plan === "yearly" || s.categoryId === null || chainIds.has(s.categoryId);
    if (!inScope) continue;
    if (s.downloadsLimit !== null && s.downloadsUsed >= s.downloadsLimit) {
      return { ok: false, reason: "quota" };
    }
    return { ok: true, via: "subscription", purchaseId: s.id };
  }

  return { ok: false, reason: "purchase" };
}

export async function userHasPremium(user: User | null) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const now = new Date();
  const [row] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, user.id),
        eq(purchases.premium, true),
        or(isNull(purchases.endsAt), gt(purchases.endsAt, now)),
      ),
    )
    .limit(1);
  return !!row;
}
