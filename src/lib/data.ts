import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, sql, gt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  downloads,
  materials,
  purchases,
  type Access,
  type Category,
  type Material,
  type MaterialKind,
  type User,
} from "@/db/schema";
import { PREMIUM_KINDS } from "./constants";
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

/** כל הקטגוריות בשאילתה אחת – לבניית עץ שלם בזיכרון (מפת הבגרות).
 * למנהלת הכל (כולל טיוטה/מושהה), למשתמשות רק פעילות. */
export async function getAllActiveCategories(isAdmin = false) {
  return db
    .select()
    .from(categories)
    .where(isAdmin ? undefined : eq(categories.status, "active"))
    .orderBy(asc(categories.sort), asc(categories.id));
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

/** מתוך רשימת תיקיות: אילו מהן יש להן תתי-תיקיות (גלויות למשתמשת) – לבחירת תמונת האגוז בכרטיס */
export async function getIdsWithChildren(ids: number[], isAdmin: boolean): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ parentId: categories.parentId })
    .from(categories)
    .where(
      isAdmin
        ? inArray(categories.parentId, ids)
        : and(inArray(categories.parentId, ids), eq(categories.status, "active")),
    );
  return new Set(rows.map((r) => r.parentId).filter((x): x is number => x !== null));
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

type ChainNode = Pick<Category, "id" | "parentId" | "slug" | "title" | "status">;

/** שרשראות-אבות (root→עצמה) לכמה קטגוריות בבת אחת — שאילתה רקורסיבית יחידה,
 * כדי שחיפוש עם כמה תוצאות לא יבצע שאילתה נפרדת לכל תוצאה (ר' searchCatalog). */
async function getChainsFor(ids: number[]): Promise<Map<number, ChainNode[]>> {
  const map = new Map<number, ChainNode[]>();
  if (ids.length === 0) return map;
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await db.execute<{
    start_id: number;
    id: number;
    parent_id: number | null;
    slug: string;
    title: string;
    status: Category["status"];
    depth: number;
  }>(sql`
    WITH RECURSIVE anc AS (
      SELECT id AS start_id, id, parent_id, slug, title, status, 0 AS depth
      FROM categories WHERE id IN (${idList})
      UNION ALL
      SELECT anc.start_id, c.id, c.parent_id, c.slug, c.title, c.status, anc.depth + 1
      FROM categories c
      JOIN anc ON c.id = anc.parent_id
    )
    SELECT * FROM anc ORDER BY start_id, depth DESC
  `);
  for (const r of rows.rows) {
    const chain = map.get(r.start_id) ?? [];
    chain.push({ id: r.id, parentId: r.parent_id, slug: r.slug, title: r.title, status: r.status });
    map.set(r.start_id, chain);
  }
  return map;
}

export type SearchResult =
  | {
      type: "category";
      id: number;
      title: string;
      description: string | null;
      questionnaireCode: string | null;
      href: string;
    }
  | {
      type: "material";
      id: number;
      title: string;
      description: string | null;
      kind: MaterialKind;
      access: Access;
      price: number;
      categoryTitle: string;
      href: string;
    };

/** חיפוש מהיר בקטלוג (קטגוריות + חומרים) לפי כותרת/תיאור.
 * למנהלת מחזיר גם טיוטות/מושהים; למשתמשת מסנן גם שרשרת אבות מושהית (chainSuspended). */
export async function searchCatalog(query: string, isAdmin = false): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const [catRows, matRows] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(
        and(
          or(ilike(categories.title, like), ilike(categories.description, like)),
          isAdmin ? undefined : eq(categories.status, "active"),
        ),
      )
      .orderBy(asc(categories.sort))
      .limit(6),
    db
      .select()
      .from(materials)
      .where(
        and(
          or(ilike(materials.title, like), ilike(materials.description, like)),
          isAdmin ? undefined : eq(materials.status, "active"),
        ),
      )
      .orderBy(desc(materials.downloads))
      .limit(8),
  ]);

  if (catRows.length === 0 && matRows.length === 0) return [];

  const chains = await getChainsFor([
    ...new Set([...catRows.map((c) => c.id), ...matRows.map((m) => m.categoryId)]),
  ]);

  const results: SearchResult[] = [];

  for (const c of catRows) {
    const chain = chains.get(c.id);
    if (!chain || (!isAdmin && chainSuspended(chain))) continue;
    results.push({
      type: "category",
      id: c.id,
      title: c.title,
      description: c.description,
      questionnaireCode: c.questionnaireCode,
      href: chainToHref(chain),
    });
  }

  for (const m of matRows) {
    const chain = chains.get(m.categoryId);
    if (!chain || (!isAdmin && chainSuspended(chain))) continue;
    results.push({
      type: "material",
      id: m.id,
      title: m.title,
      description: m.description,
      kind: m.kind,
      access: m.access,
      price: m.price,
      categoryTitle: chain[chain.length - 1].title,
      href: `${chainToHref(chain)}#material-${m.id}`,
    });
  }

  return results;
}

export function chainToHref(chain: Pick<Category, "slug">[]) {
  return "/subjects/" + chain.map((c) => encodeURIComponent(c.slug)).join("/");
}

/** האם שרשרת הקטגוריות מכילה קטגוריה מושהית/טיוטה */
export function chainSuspended(chain: Pick<Category, "status">[]) {
  return chain.some((c) => c.status !== "active");
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

export async function countMaterialsUnder(rootId: number, isAdmin = false): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM categories WHERE id = ${rootId}
      UNION ALL
      SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
    )
    SELECT count(*)::int AS n FROM materials
    WHERE category_id IN (SELECT id FROM tree) ${isAdmin ? sql`` : sql`AND status = 'active'`}
  `);
  return Number(rows.rows[0]?.n ?? 0);
}

export type Entitlement =
  | {
      ok: true;
      via: "admin" | "single" | "bundle" | "subscription" | "free";
      purchaseId?: number;
    }
  | {
      ok: false;
      reason: "login" | "premium" | "purchase" | "quota" | "suspended";
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
  // רכישת תיקייה כוללת את כל הקבצים שבה, גם סוגים שבדרך כלל דורשים פרימיום
  const ownsBundle = active.some(
    (p) => p.plan === "bundle" && p.categoryId !== null && chainIds.has(p.categoryId),
  );
  if (isPremiumKind && !hasPremium && !ownsBundle) return { ok: false, reason: "premium" };

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
    // categoryId ריק = גישה לכל המקצועות (מנויים שנתיים ישנים, מלפני בחירת 3 המקצועות)
    if (s.subjectsPending) continue; // מנוי שנתי שעוד לא נבחרו בו מקצועות – אין גישה עד הבחירה
    const inScope = s.categoryId === null || chainIds.has(s.categoryId);
    if (!inScope) continue;
    if (s.downloadsLimit !== null && s.downloadsUsed >= s.downloadsLimit) {
      return { ok: false, reason: "quota" };
    }
    return { ok: true, via: "subscription", purchaseId: s.id };
  }

  return { ok: false, reason: "purchase" };
}

/** מספר ההורדות של המשתמשת הזו, לכל חומר מתוך הרשימה (Map<materialId, count>) */
export async function getUserDownloadCounts(
  userId: number,
  materialIds: number[],
): Promise<Map<number, number>> {
  if (materialIds.length === 0) return new Map();
  const rows = await db
    .select({ materialId: downloads.materialId, n: count() })
    .from(downloads)
    .where(and(eq(downloads.userId, userId), inArray(downloads.materialId, materialIds)))
    .groupBy(downloads.materialId);
  return new Map(rows.map((r) => [r.materialId, Number(r.n)]));
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

/**
 * גישה לפורום של יחידה: מנהלת, מנויה (פרימיום פעיל או מנוי שמכסה את היחידה),
 * או מי שרכשה את תיקיית היחידה / קובץ בודד שנמצא בה. מושעה – אין גישה.
 */
export async function userCanUseUnitForum(user: User | null, categoryId: number) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.suspended) return false;
  const active = await getActivePurchases(user.id);
  if (active.length === 0) return false;
  if (active.some((p) => p.premium)) return true;
  const chainIds = new Set((await getCategoryChain(categoryId)).map((c) => c.id));
  const covers = active.some(
    (p) => p.plan !== "single" && !p.subjectsPending && (p.categoryId === null || chainIds.has(p.categoryId)),
  );
  if (covers) return true;
  const singleIds = active.flatMap((p) => (p.plan === "single" && p.materialId !== null ? [p.materialId] : []));
  if (singleIds.length === 0) return false;
  const [row] = await db
    .select({ id: materials.id })
    .from(materials)
    .where(and(inArray(materials.id, singleIds), eq(materials.categoryId, categoryId)))
    .limit(1);
  return !!row;
}

/** מספרים לדף הבית: מקצועות, פרקים (תיקיות), קבצים, הורדות וכניסות — כולם מהנתונים האמיתיים.
 *  "כניסה" = גולש (סשן) שנכנס ביום מסוים, מכל הגולשים. */
export async function getHomeStats() {
  const [[subj], [cats], [mats], visitRows] = await Promise.all([
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
      .where(inArray(materials.status, ["active", "draft"])),
    db.execute(
      sql`SELECT count(*)::int AS n FROM (SELECT DISTINCT coalesce(session_id, ip, id::text) AS who, created_at::date AS d FROM page_views) v`,
    ),
  ]);
  const visits = Number((visitRows.rows[0] as { n?: number } | undefined)?.n ?? 0);
  return {
    subjects: subj?.n ?? 0,
    folders: cats?.n ?? 0,
    files: mats?.n ?? 0,
    downloads: mats?.d ?? 0,
    visits,
  };
}
