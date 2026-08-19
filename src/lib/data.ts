import "server-only";
import { and, asc, eq, isNull, sql, gt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  materials,
  purchases,
  type Category,
  type Material,
  type Tier,
  type User,
} from "@/db/schema";
import { PREMIUM_KINDS, TIERS, tierAtLeast } from "./constants";
import { getBool } from "./settings";

/**
 * מקצועות שורש. כברירת מחדל מוסתרים המושהים/טיוטות (למשתמשות);
 * עמודי ניהול יכולים להעביר includeSuspended=true.
 */
export async function getRootSubjects(includeSuspended = false) {
  const cond = includeSuspended
    ? isNull(categories.parentId)
    : and(isNull(categories.parentId), eq(categories.status, "active"));
  return db
    .select()
    .from(categories)
    .where(cond)
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

/** תתי-קטגוריות – למנהלת הכל, למשתמשות רק פעילות */
export async function getVisibleChildren(parentId: number, isAdmin: boolean) {
  if (isAdmin) return getChildren(parentId);
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.parentId, parentId), eq(categories.status, "active")))
    .orderBy(asc(categories.sort), asc(categories.id));
}

/** חומרים – למנהלת הכל, למשתמשות רק פעילים */
export async function getVisibleMaterials(categoryId: number, isAdmin: boolean) {
  if (isAdmin) return getMaterials(categoryId);
  return db
    .select()
    .from(materials)
    .where(and(eq(materials.categoryId, categoryId), eq(materials.status, "active")))
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

/** האם שרשרת הקטגוריות מכילה קטגוריה מושהית/טיוטה */
export function chainSuspended(chain: Category[]) {
  return chain.some((c) => c.status !== "active");
}

/** רמת הפרימיום המינימלית האפקטיבית (מקסימום של החומר וכל שרשרת הקטגוריות) */
export function effectiveMinTier(material: Pick<Material, "minTier">, chain: Category[]): Tier {
  let best: Tier = material.minTier;
  for (const c of chain) {
    if (TIERS[c.minTier].order > TIERS[best].order) best = c.minTier;
  }
  return best;
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
  | {
      ok: true;
      via: "admin" | "single" | "bundle" | "subscription" | "free" | "tier";
      purchaseId?: number;
    }
  | {
      ok: false;
      reason: "login" | "premium" | "tier" | "purchase" | "quota" | "suspended";
    };

/** רכישות פעילות (סטטוס active ולא פגו) של משתמשת */
export async function getActivePurchases(userId: number) {
  const now = new Date();
  return db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.status, "active"),
        or(isNull(purchases.endsAt), gt(purchases.endsAt, now)),
      ),
    );
}

/** בודק האם המשתמשת רשאית להוריד את החומר */
export async function checkEntitlement(
  user: User | null,
  material: Material,
): Promise<Entitlement> {
  if (user?.role === "admin") return { ok: true, via: "admin" };
  if (user?.suspended) return { ok: false, reason: "suspended" };
  if (material.status !== "active") return { ok: false, reason: "suspended" };

  const chain = await getCategoryChain(material.categoryId);
  if (chainSuspended(chain)) return { ok: false, reason: "suspended" };
  const chainIds = new Set(chain.map((c) => c.id));
  const minTier = effectiveMinTier(material, chain);

  // חינם – לכל מחוברת (או גם לאורחות, לפי ההגדרות)
  if (material.access === "free") {
    if (!user) {
      const requireLogin = await getBool("free_downloads_require_login");
      if (requireLogin) return { ok: false, reason: "login" };
    }
    return { ok: true, via: "free" };
  }

  if (!user) return { ok: false, reason: "login" };

  const isPremiumKind =
    material.access === "premium" || material.premiumOnly || PREMIUM_KINDS.includes(material.kind);

  const active = await getActivePurchases(user.id);
  const hasPremium = active.some((p) => p.premium);
  if (isPremiumKind && !hasPremium) return { ok: false, reason: "premium" };
  if (!tierAtLeast(user.tier, minTier)) return { ok: false, reason: "tier" };

  // לפי רמה – עברה את בדיקת הרמה, זכאית
  if (material.access === "tier") return { ok: true, via: "tier" };

  // רכישה בודדת של החומר עצמו
  const single = active.find((p) => p.plan === "single" && p.materialId === material.id);
  if (single) return { ok: true, via: "single", purchaseId: single.id };

  // רכישת תיקייה מורחבת שמכילה את החומר
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
  if (user.suspended) return false;
  const now = new Date();
  const [row] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, user.id),
        eq(purchases.premium, true),
        eq(purchases.status, "active"),
        or(isNull(purchases.endsAt), gt(purchases.endsAt, now)),
      ),
    )
    .limit(1);
  return !!row;
}

/** מספרים לדף הבית: מקצועות, פרקים (תיקיות), קבצים והורדות — כולם מהנתונים האמיתיים */
export async function getHomeStats() {
  const [[subj], [cats], [mats]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(categories)
      .where(and(isNull(categories.parentId), eq(categories.status, "active"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(categories)
      .where(eq(categories.status, "active")),
    db
      .select({
        n: sql<number>`count(*)::int`,
        d: sql<number>`coalesce(sum(${materials.downloads}),0)::int`,
      })
      .from(materials)
      .where(eq(materials.status, "active")),
  ]);
  return {
    subjects: subj?.n ?? 0,
    folders: cats?.n ?? 0,
    files: mats?.n ?? 0,
    downloads: mats?.d ?? 0,
  };
}
