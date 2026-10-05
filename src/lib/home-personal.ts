import "server-only";
import { eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { categories, downloads, materials, type Category, type User } from "@/db/schema";
import { getActivePurchases } from "./data";

/*
 * התאמה אישית של דף הבית למורה מחוברת:
 * - "המקצועות שלי": מקצועות שורש מהמנוי/רכישות + מקצועות שממנם כבר הורידה.
 * - "השיעור הבא בתור": בכל מקצוע – אחרי השיעור (קטגוריה עם חומרים) שהורידה ממנו לאחרונה,
 *   לפי סדר העץ. לא חוצים מסלול (פנימי/חיצוני) – הרצף נעצר בסוף המסלול.
 */

type Tree = {
  byId: Map<number, Category>;
  children: Map<number, Category[]>;
  roots: Category[];
  /** קטגוריות פעילות שיש בהן לפחות חומר פעיל אחד */
  withMaterials: Set<number>;
};

async function loadTree(): Promise<Tree> {
  const [cats, mats] = await Promise.all([
    db.select().from(categories).where(eq(categories.status, "active")).orderBy(categories.sort, categories.id),
    db.selectDistinct({ categoryId: materials.categoryId }).from(materials).where(eq(materials.status, "active")),
  ]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const children = new Map<number, Category[]>();
  const roots: Category[] = [];
  for (const c of cats) {
    if (c.parentId === null) roots.push(c);
    else {
      const list = children.get(c.parentId) ?? [];
      list.push(c);
      children.set(c.parentId, list);
    }
  }
  return { byId, children, roots, withMaterials: new Set(mats.map((m) => m.categoryId)) };
}

/** שרשרת root→node (null אם אחד האבות לא פעיל) */
function pathTo(tree: Tree, id: number): Category[] | null {
  const path: Category[] = [];
  let cur: Category | undefined = tree.byId.get(id);
  while (cur) {
    path.unshift(cur);
    if (cur.parentId === null) return path;
    cur = tree.byId.get(cur.parentId);
  }
  return null;
}

const hrefOf = (path: Category[]) => "/subjects/" + path.map((c) => encodeURIComponent(c.slug)).join("/");

/** מזהי מקצועות השורש של המורה (לפי סדר המקצועות באתר) */
async function myRootIds(user: User, tree: Tree, lastByCategory: Map<number, Date>): Promise<Set<number>> {
  if (user.role === "admin") return new Set(tree.roots.map((r) => r.id));
  const ids = new Set<number>();
  const addCat = (categoryId: number | null) => {
    if (categoryId === null) return;
    const p = pathTo(tree, categoryId);
    if (p) ids.add(p[0].id);
  };

  const active = await getActivePurchases(user.id);
  const singleMaterialIds: number[] = [];
  for (const p of active) {
    if (p.subjectsPending) continue;
    if (p.plan === "single") {
      if (p.materialId !== null) singleMaterialIds.push(p.materialId);
    } else if (p.categoryId === null) {
      // מנוי ללא מקצוע מוגדר = גישה לכל המקצועות (מנויים ישנים)
      if (p.plan === "yearly" || p.plan === "subject_monthly" || p.plan === "custom_monthly") {
        for (const r of tree.roots) ids.add(r.id);
      }
    } else addCat(p.categoryId);
  }
  if (singleMaterialIds.length) {
    const rows = await db
      .select({ categoryId: materials.categoryId })
      .from(materials)
      .where(inArray(materials.id, singleMaterialIds));
    rows.forEach((r) => addCat(r.categoryId));
  }
  for (const categoryId of lastByCategory.keys()) addCat(categoryId);
  return ids;
}

async function lastDownloadByCategory(userId: number): Promise<Map<number, Date>> {
  const rows = await db
    .select({ categoryId: materials.categoryId, last: max(downloads.createdAt) })
    .from(downloads)
    .innerJoin(materials, eq(materials.id, downloads.materialId))
    .where(eq(downloads.userId, userId))
    .groupBy(materials.categoryId);
  const map = new Map<number, Date>();
  for (const r of rows) if (r.last) map.set(r.categoryId, r.last);
  return map;
}

export type MySubject = {
  id: number;
  title: string;
  href: string;
  /** היעד של "השיעור הבא": השיעור עצמו, או התיקייה (כשעוד לא התחילה / סיימה את הרצף) */
  nextHref: string;
  /** מה כתוב מתחת לשם המקצוע בבחירה */
  nextHint: string;
};

/** המקצועות שלי + השיעור הבא בתור בכל אחד. ריק = אין עדיין מקצועות (אורחת/חדשה) */
export async function getMySubjects(user: User): Promise<MySubject[]> {
  const tree = await loadTree();
  const lastByCategory = await lastDownloadByCategory(user.id);
  const mine = await myRootIds(user, tree, lastByCategory);

  // שיעור = קטגוריה פעילה עם חומרים שלא הוצאה מהמיקוד; סדר: מקדים-אב ואז הילדים
  const isLesson = (c: Category) => tree.withMaterials.has(c.id) && !c.excluded;
  const lessonsOf = (scope: Category) => {
    const out: Category[] = [];
    const walk = (c: Category) => {
      if (isLesson(c)) out.push(c);
      for (const ch of tree.children.get(c.id) ?? []) walk(ch);
    };
    walk(scope);
    return out;
  };

  const result: MySubject[] = [];
  for (const root of tree.roots) {
    if (!mine.has(root.id)) continue;
    const rootHref = hrefOf([root]);

    // השיעור שהורידה ממנו לאחרונה בתוך המקצוע הזה
    let lastCat: Category | null = null;
    let lastAt = 0;
    let lastPath: Category[] | null = null;
    for (const [categoryId, at] of lastByCategory) {
      if (at.getTime() <= lastAt) continue;
      const p = pathTo(tree, categoryId);
      if (!p || p[0].id !== root.id) continue;
      lastCat = p[p.length - 1];
      lastPath = p;
      lastAt = at.getTime();
    }

    if (!lastCat || !lastPath) {
      result.push({
        id: root.id,
        title: root.title,
        href: rootHref,
        nextHref: rootHref,
        nextHint: "עוד לא הורדת כאן – נתחיל מהתיקייה",
      });
      continue;
    }

    // הרצף נשאר בתוך המסלול (root → יחידות → פנימי/חיצוני); בעץ רדוד יותר – בתוך המקצוע
    const scope = lastPath.length > 3 ? lastPath[2] : root;
    const order = lessonsOf(scope);
    const idx = order.findIndex((c) => c.id === lastCat.id);
    const next = idx >= 0 ? order[idx + 1] : undefined;
    if (!next) {
      const scopePath = pathTo(tree, scope.id) ?? [root];
      result.push({
        id: root.id,
        title: root.title,
        href: rootHref,
        nextHref: hrefOf(scopePath),
        nextHint: "סיימת את כל הרצף כאן – חזרה לתיקייה",
      });
      continue;
    }
    const nextPath = pathTo(tree, next.id) ?? [root, next];
    const label = nextPath
      .slice(Math.max(1, nextPath.length - 2))
      .map((c) => c.title)
      .join(" · ");
    result.push({ id: root.id, title: root.title, href: rootHref, nextHref: hrefOf(nextPath), nextHint: `הבא: ${label}` });
  }
  return result;
}

/** רק מזהי מקצועות השורש שלי (לסינון עמוד המקצועות) */
export async function getMyRootSubjectIds(user: User): Promise<Set<number>> {
  const tree = await loadTree();
  return myRootIds(user, tree, await lastDownloadByCategory(user.id));
}
