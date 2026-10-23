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
import { getBool } from "./settings";
import { rankItems, scoreItem, tokenize } from "./search-match";

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

/** חומר שאפשר באמת להגיש: הקובץ בדרייב. שורות ישנות עם Vercel Blob / example.com מתות (ר' docs/drive-storage.md)
 *  ונשארות בטבלה רק למנהלת – למשתמשת הן היו מוצגות ככרטיס שנופל ב-502. */
export const materialServable = sql`${materials.fileUrl} LIKE 'drive://%'`;

/** חומרים – למנהלת הכל, למשתמשות רק פעילים שהקובץ שלהם קיים (בדרייב) */
export async function getVisibleMaterials(categoryId: number, isAdmin: boolean) {
  if (isAdmin) return getMaterials(categoryId);
  return db
    .select()
    .from(materials)
    .where(and(eq(materials.categoryId, categoryId), eq(materials.status, "active"), materialServable))
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
      /** מסלול התיקייה בעץ (בלי המקצוע השורשי), להצגה כהקשר: "בגרות 3 יחידות › בא" */
      path: string;
      /** התאמה חלקית (חסרה מילה אחת מהשאילתה) */
      approx?: boolean;
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
      /** מסלול התיקייה שבה הקובץ נמצא (בלי המקצוע השורשי) */
      path: string;
      approx?: boolean;
    };

/** אינדקס החיפוש בזיכרון: כל הקטגוריות והחומרים הניתנים להגשה, עם שרשראות-האבות. ~2.5K שורות קלות – נטען פעם ב-5 דקות לכל instance. */
type SearchCat = { c: Pick<Category, "id" | "title" | "description" | "questionnaireCode">; chain: ChainNode[] };
type SearchMat = {
  m: Pick<Material, "id" | "title" | "description" | "kind" | "access" | "price" | "downloads">;
  chain: ChainNode[];
};
type SearchIndex = { cats: SearchCat[]; mats: SearchMat[] };
const SEARCH_INDEX_TTL_MS = 5 * 60_000;
const searchIndexCache = new Map<boolean, { at: number; data: SearchIndex }>();

async function loadSearchIndex(isAdmin: boolean): Promise<SearchIndex> {
  const hit = searchIndexCache.get(isAdmin);
  if (hit && Date.now() - hit.at < SEARCH_INDEX_TTL_MS) return hit.data;
  const [catRows, matRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        parentId: categories.parentId,
        slug: categories.slug,
        title: categories.title,
        status: categories.status,
        description: categories.description,
        questionnaireCode: categories.questionnaireCode,
      })
      .from(categories),
    db
      .select({
        id: materials.id,
        categoryId: materials.categoryId,
        title: materials.title,
        description: materials.description,
        kind: materials.kind,
        access: materials.access,
        price: materials.price,
        downloads: materials.downloads,
      })
      .from(materials)
      .where(isAdmin ? undefined : and(eq(materials.status, "active"), materialServable)),
  ]);
  const byId = new Map(catRows.map((c) => [c.id, c]));
  const chainOf = (id: number): ChainNode[] => {
    const chain: ChainNode[] = [];
    let cur = byId.get(id);
    for (let i = 0; cur && i < 12; i++) {
      chain.unshift({ id: cur.id, parentId: cur.parentId, slug: cur.slug, title: cur.title, status: cur.status });
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  };
  const visible = (chain: ChainNode[]) => chain.length > 0 && (isAdmin || !chainSuspended(chain));
  const cats: SearchCat[] = [];
  for (const c of catRows) {
    const chain = chainOf(c.id);
    if (visible(chain)) cats.push({ c, chain });
  }
  const mats: SearchMat[] = [];
  for (const m of matRows) {
    const chain = chainOf(m.categoryId);
    if (visible(chain)) mats.push({ m, chain });
  }
  // אינדקס ריק = תקלה (שאילתה שנכשלה בשקט / סינון שגוי), לא קטלוג ריק – נכשלים בקול כדי שיופעל הגיבוי ויירשם ללוג
  if (cats.length === 0 || mats.length === 0) throw new Error(`empty search index (cats=${cats.length}, mats=${mats.length}, catRows=${catRows.length}, matRows=${matRows.length})`);
  const data = { cats, mats };
  searchIndexCache.set(isAdmin, { at: Date.now(), data });
  return data;
}

/** מסלול להצגה: שרשרת הכותרות בלי המקצוע השורשי ובלי הפריט עצמו (לקטגוריה) */
const pathOf = (chain: ChainNode[], includeLast: boolean) =>
  chain
    .slice(1, includeLast ? undefined : -1)
    .map((n) => n.title)
    .join(" › ");

/**
 * חיפוש חכם בקטלוג (קטגוריות + חומרים) – ר' search-match.ts: מילים חופשיות בכל סדר, מספרים ("13" = "יג"), אותיות שימוש,
 * מילות הקשר אופציונליות ("פרשת"), סוג קובץ ("לתלמידה"), ותוצאות קרובות כשאין התאמה מלאה.
 * "פרשת בא פרק יג לתלמידה" מוצא את "דף לתלמידה - פרק יג" שבתיקיית פרק י"ג שבתוך "בא".
 * למנהלת מחזיר גם טיוטות/מושהים; למשתמשת מסנן גם שרשרת אבות מושהית (chainSuspended).
 */
export async function searchCatalog(query: string, isAdmin = false): Promise<SearchResult[]> {
  try {
    const smart = await searchCatalogSmart(query, isAdmin);
    if (smart.length > 0) return smart;
    // אין תוצאה חכמה: הישן עדיין עשוי למצוא (למשל תיאור/תת-מחרוזת), כך שהחיפוש אף פעם לא גרוע מקודם
    return await searchCatalogLegacy(query, isAdmin);
  } catch (e) {
    // לעולם לא משאירים את החיפוש ריק בגלל כשל באינדקס: רושמים ללוג וחוזרים לחיפוש ה-SQL הישן
    console.error("[search] smart search failed, falling back to legacy:", e instanceof Error ? e.stack ?? e.message : e);
    return searchCatalogLegacy(query, isAdmin);
  }
}

async function searchCatalogSmart(query: string, isAdmin: boolean): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const index = await loadSearchIndex(isAdmin);

  // קטגוריות: מילים שאינן מופיעות באף קטגוריה (סוג קובץ כמו "לתלמידה", "העשרה") מתייחסים אליהן כהקשר של החומרים בלבד,
  // כדי שהתיקייה תימצא כהתאמה מלאה ("פרשת בא פרק יג לתלמידה" ← התיקייה בא › פרק י"ג) ולא כ"קרובה"
  const catItemOf = ({ c, chain }: SearchCat) => ({ title: c.title, ancestors: chain.slice(0, -1).map((n) => n.title), description: c.description });
  const catQuery = tokenize(q)
    .filter((t) => index.cats.some((x) => scoreItem([t], catItemOf(x), new Set()).matched > 0))
    .join(" ");
  const catRank = rankItems(
    catQuery,
    index.cats,
    catItemOf,
  );
  const matRank = rankItems(
    q,
    index.mats,
    ({ m, chain }) => ({ title: m.title, ancestors: chain.map((n) => n.title), description: m.description, kind: m.kind }),
    ({ m }) => m.downloads,
  );

  const results: SearchResult[] = [];
  for (const { c, chain } of catRank.items.slice(0, 6)) {
    results.push({
      type: "category",
      id: c.id,
      title: c.title,
      description: c.description,
      questionnaireCode: c.questionnaireCode,
      href: chainToHref(chain),
      path: pathOf(chain, false),
      ...(catRank.approx ? { approx: true } : {}),
    });
  }
  for (const { m, chain } of matRank.items.slice(0, 10)) {
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
      path: pathOf(chain, true),
      ...(matRank.approx ? { approx: true } : {}),
    });
  }
  return results;
}

/** חיפוש ה-SQL הישן (כותרת/תיאור) – גיבוי כשהחיפוש החכם נכשל (ר' searchCatalog). */
async function searchCatalogLegacy(query: string, isAdmin = false): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  // % ו-_ הם תווי-כלליות ב-LIKE – מבריחים אותם כדי שמונח כמו "_" לא יתאים להכול (ולא יהפוך לסריקה יקרה)
  const likeOf = (s: string) => `%${s.replace(/[\\%_]/g, "\\export function chainToHref")}%`;
  // חיפוש רב-מילים ("ישעיה פרק ו", "תהלים נא"): כל מילה חייבת להופיע בכותרת/תיאור או באחת מקטגוריות-האב,
  // כי "ישעיה" ו-"פרק ו'" יושבים בצמתים שונים של העץ. מילה בודדת = חיפוש ביטוי כמו קודם.
  const tokens = q.split(/\s+/).filter(Boolean);
  const multi = tokens.length > 1;
  // ל-SQL נכנסות רק מילים באורך 2+ (מילה של אות אחת כמו "ו" הייתה מחזירה את כל הטבלה); הסינון המלא נעשה אחר כך
  const sqlTerms = multi ? tokens.filter((t) => t.length >= 2) : [q];
  if (sqlTerms.length === 0) return [];
  const likes = sqlTerms.map(likeOf);
  const limitCats = multi ? 200 : 6;
  const limitMats = multi ? 200 : 8;

  const [catRows, matRows] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(
        and(
          or(...likes.flatMap((like) => [ilike(categories.title, like), ilike(categories.description, like)])),
          isAdmin ? undefined : eq(categories.status, "active"),
        ),
      )
      .orderBy(asc(categories.sort))
      .limit(limitCats),
    db
      .select()
      .from(materials)
      .where(
        and(
          or(...likes.flatMap((like) => [ilike(materials.title, like), ilike(materials.description, like)])),
          isAdmin ? undefined : and(eq(materials.status, "active"), materialServable),
        ),
      )
      .orderBy(desc(materials.downloads))
      .limit(limitMats),
  ]);

  if (catRows.length === 0 && matRows.length === 0) return [];

  const chains = await getChainsFor([
    ...new Set([...catRows.map((c) => c.id), ...matRows.map((m) => m.categoryId)]),
  ]);

  // השוואה בלי גרש/גרשיים ובלי רגישות לאותיות, כדי ש-"פרק ו" ימצא את "פרק ו'"
  const norm = (s: string | null | undefined) => (s ?? "").replace(/["'״׳]/g, "").toLowerCase();
  const normTokens = tokens.map(norm).filter(Boolean);
  // מילה קצרה (אות-שתיים, בדרך כלל מספר פרק כמו "ו" / "נא") חייבת להופיע כמילה שלמה, אחרת "ו" מתאים להכול
  const tokenHits = (t: string, hay: string) =>
    t.length <= 2 ? new RegExp(`(^|[\\s\\-–(])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\export function chainToHref")}(?=$|[\\s\\-–),:])`).test(hay) : hay.includes(t);
  const matchesAll = (hay: string) => normTokens.every((t) => tokenHits(t, hay));
  const inTitle = (title: string) => normTokens.filter((t) => tokenHits(t, norm(title))).length;

  const results: SearchResult[] = [];

  const cats = catRows
    .map((c) => ({ c, chain: chains.get(c.id) }))
    .filter(({ c, chain }) => {
      if (!chain || (!isAdmin && chainSuspended(chain))) return false;
      if (!multi) return true;
      return matchesAll(norm([...chain.map((n) => n.title), c.description ?? ""].join(" ")));
    })
    .sort((a, b) => inTitle(b.c.title) - inTitle(a.c.title))
    .slice(0, 6);
  for (const { c, chain } of cats) {
    if (!chain) continue;
    results.push({
      type: "category",
      path: "",
      id: c.id,
      title: c.title,
      description: c.description,
      questionnaireCode: c.questionnaireCode,
      href: chainToHref(chain),
    });
  }

  const mats = matRows
    .map((m) => ({ m, chain: chains.get(m.categoryId) }))
    .filter(({ m, chain }) => {
      if (!chain || (!isAdmin && chainSuspended(chain))) return false;
      if (!multi) return true;
      return matchesAll(norm([m.title, m.description ?? "", ...chain.map((n) => n.title)].join(" ")));
    })
    .sort((a, b) => inTitle(b.m.title) - inTitle(a.m.title))
    .slice(0, 8);
  for (const { m, chain } of mats) {
    if (!chain) continue;
    results.push({
      type: "material",
      path: "",
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
      reason: "login" | "purchase" | "quota" | "suspended";
    };

/**
 * רכישות פעילות (סטטוס active ולא פגו) של משתמשת.
 * שורות "פרימיום בלבד" ישנות (plan=single בלי materialId, downloadsLimit=0) חוזרות גם הן אבל לא מקנות דבר –
 * הן לא תואמות לשום חומר ולא נחשבות מנוי. אין יותר תוספת פרימיום: מנוי פעיל פותח את כל סוגי החומרים.
 */
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

  // אין הבחנה בין סוגי חומרים (אין יותר "פרימיום"): כל רכישה/מנוי שמכסה את החומר פותחת אותו, מכל סוג
  const active = await getActivePurchases(user.id);

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
    ["subject_monthly", "custom_monthly", "yearly", "substitute_3m", "substitute_daily"].includes(p.plan),
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

/** יחידה חינמית = יש בה חומרים וכולם חינמיים (אותה הגדרה כמו hasPaid בדף היחידה) */
export async function isFreeUnit(categoryId: number) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      paid: sql<number>`count(*) filter (where ${materials.access} <> 'free')::int`,
    })
    .from(materials)
    .where(eq(materials.categoryId, categoryId));
  return !!row && row.total > 0 && row.paid === 0;
}

/**
 * גישה לפורום של יחידה: מנהלת, מנויה (מנוי שמכסה את היחידה),
 * או מי שרכשה את תיקיית היחידה / קובץ בודד שנמצא בה. מושעה – אין גישה.
 * ביחידה חינמית – כל מורה מחוברת (הרשמה בלבד) יכולה לכתוב; אורחת רק צופה (ר' isFreeUnit).
 */
export async function userCanUseUnitForum(user: User | null, categoryId: number) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.suspended) return false;
  if (await isFreeUnit(categoryId)) return true;
  const active = await getActivePurchases(user.id);
  if (active.length === 0) return false;
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
        free: sql<number>`count(*) filter (where ${materials.access} = 'free' and ${materials.status} = 'active')::int`,
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
    freeFiles: mats?.free ?? 0,
    visits,
  };
}
