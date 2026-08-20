/**
 * בדיקת תקינות (QA) של עץ הקטגוריות מול מסד הנתונים — קריאה בלבד, לא משנה כלום.
 * הרצה: npm run verify:tree   (או: npx tsx scripts/verify-tree.ts)
 * דורש NODE_OPTIONS=--use-system-ca (כמו שאר סקריפטי ה-DB).
 *
 * בודק:
 *  1. כל צומת ב-TREE קיים ב-DB באותו נתיב, עם אותו title ו-questionnaireCode.
 *  2. קטגוריות עודפות ב-DB תחת שורשי ה-TREE (אזהרה בלבד — ייתכן שנוצרו ע"י מנהלת).
 *  3. שלמות מבנית: אין יתומים, אין מעגלים, אין כפילויות (parent_id, slug), סטטוסים תקינים.
 *  4. לכל צומת-אב ב-TREE יש לפחות ילד אחד ב-DB, וספירת העלים תואמת.
 * קוד יציאה 0 רק אם אין כשלים (אזהרות מותרות).
 */
import "dotenv/config";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { TREE, type Node } from "./curriculum-tree";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}
const db = drizzle(neon(url), { schema });
const { categories } = schema;

/** ניסיון חוזר לפעולות DB — הרשת לניאון נופלת לעיתים תחת עומס */
async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= tries) throw e;
      console.warn(`retry ${attempt}/${tries} (${label})…`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

type DbCat = {
  id: number;
  parentId: number | null;
  slug: string;
  title: string;
  questionnaireCode: string | null;
  status: string;
};

const failures: string[] = [];
const warnings: string[] = [];
const fail = (msg: string) => failures.push(msg);
const warn = (msg: string) => warnings.push(msg);

function countTreeNodes(nodes: Node[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countTreeNodes(n.children ?? []), 0);
}
function countTreeLeaves(nodes: Node[]): number {
  return nodes.reduce(
    (sum, n) => sum + (n.children?.length ? countTreeLeaves(n.children) : 1),
    0,
  );
}

async function main() {
  console.log("Verifying curriculum tree against DB…\n");

  const rows: DbCat[] = await withRetry(
    () =>
      db
        .select({
          id: categories.id,
          parentId: categories.parentId,
          slug: categories.slug,
          title: categories.title,
          questionnaireCode: categories.questionnaireCode,
          status: categories.status,
        })
        .from(categories),
    "select all categories",
  );

  /* ---------- אינדקסים ---------- */
  const byId = new Map<number, DbCat>();
  for (const r of rows) byId.set(r.id, r);
  const childrenByParent = new Map<number | null, DbCat[]>();
  for (const r of rows) {
    const list = childrenByParent.get(r.parentId) ?? [];
    list.push(r);
    childrenByParent.set(r.parentId, list);
  }
  const findChild = (parentId: number | null, slug: string): DbCat | undefined =>
    (childrenByParent.get(parentId) ?? []).find((c) => c.slug === slug);

  /* ========== 3. שלמות מבנית (על כל הטבלה) ========== */

  // יתומים
  const orphans = rows.filter((r) => r.parentId !== null && !byId.has(r.parentId));
  if (orphans.length) {
    for (const o of orphans)
      fail(`orphan: category #${o.id} "${o.title}" (slug=${o.slug}) → parent_id=${o.parentId} לא קיים`);
  }

  // מעגלים
  const cycleIds: number[] = [];
  {
    const state = new Map<number, 0 | 1 | 2>(); // 1=בבדיקה, 2=נקי
    for (const r of rows) {
      let chain: number[] = [];
      let cur: DbCat | undefined = r;
      while (cur && state.get(cur.id) === undefined) {
        state.set(cur.id, 1);
        chain.push(cur.id);
        cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
      }
      if (cur && state.get(cur.id) === 1) {
        cycleIds.push(cur.id);
        fail(`cycle: מעגל בשרשרת ההורים דרך קטגוריה #${cur.id} "${byId.get(cur.id)?.title}"`);
      }
      for (const id of chain) state.set(id, 2);
    }
  }

  // כפילויות (parent_id, slug)
  const dupKeys = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.parentId ?? "root"}/${r.slug}`;
    dupKeys.set(key, (dupKeys.get(key) ?? 0) + 1);
  }
  const dups = [...dupKeys.entries()].filter(([, n]) => n > 1);
  for (const [key, n] of dups) fail(`duplicate: המפתח (parent,slug)=${key} מופיע ${n} פעמים`);

  // סטטוסים
  const validStatuses = new Set(schema.statusEnum.enumValues as readonly string[]);
  const badStatus = rows.filter((r) => !validStatuses.has(r.status));
  for (const r of badStatus)
    fail(`status: קטגוריה #${r.id} "${r.title}" עם סטטוס לא תקין: "${r.status}"`);

  const structOk = !orphans.length && !cycleIds.length && !dups.length && !badStatus.length;
  console.log(
    `${structOk ? "✓" : "✗"} שלמות מבנית: ` +
      `יתומים=${orphans.length}, מעגלים=${cycleIds.length}, כפילויות=${dups.length}, סטטוסים פסולים=${badStatus.length}`,
  );

  /* ========== 1+4. השוואת TREE ↔ DB ========== */

  const matchedIds = new Set<number>();
  let matched = 0;
  let missing = 0;
  let mismatched = 0;
  let nonLeafNoChildren = 0;

  function walk(node: Node, parentId: number | null, path: string) {
    const dbNode = findChild(parentId, node.slug);
    if (!dbNode) {
      missing++;
      fail(`missing: הצומת ${path} ("${node.title}") לא קיים ב-DB`);
      return;
    }
    matchedIds.add(dbNode.id);
    let ok = true;
    if (dbNode.title !== node.title) {
      ok = false;
      mismatched++;
      fail(`title mismatch: ${path} — TREE="${node.title}" ↔ DB="${dbNode.title}"`);
    }
    const treeCode = node.questionnaireCode ?? null;
    if (dbNode.questionnaireCode !== treeCode) {
      ok = false;
      mismatched++;
      fail(
        `code mismatch: ${path} — TREE=${treeCode ?? "(ללא)"} ↔ DB=${dbNode.questionnaireCode ?? "(ללא)"}`,
      );
    }
    if (ok) matched++;
    if (dbNode.status !== "active")
      warn(`status: הצומת ${path} במצב "${dbNode.status}" (מוסתר מהמשתמשות)`);

    const kids = node.children ?? [];
    if (kids.length) {
      const dbKids = childrenByParent.get(dbNode.id) ?? [];
      if (!dbKids.length) {
        nonLeafNoChildren++;
        fail(`no children: לצומת-האב ${path} אין אף ילד ב-DB (ב-TREE יש ${kids.length})`);
      }
      for (const child of kids) walk(child, dbNode.id, `${path}/${child.slug}`);
    }
  }

  for (const root of TREE) walk(root, null, root.slug);

  const totalTree = countTreeNodes(TREE);
  console.log(
    `${missing + mismatched === 0 ? "✓" : "✗"} התאמת TREE↔DB: ` +
      `${matched}/${totalTree} צמתים תואמים במלואם (חסרים=${missing}, אי-התאמות=${mismatched})`,
  );
  console.log(
    `${nonLeafNoChildren === 0 ? "✓" : "✗"} צמתי-אב: לכל צומת-אב ב-TREE יש ילדים ב-DB` +
      (nonLeafNoChildren ? ` (${nonLeafNoChildren} חריגים)` : ""),
  );

  /* ========== 2. עודפים ב-DB תחת שורשי ה-TREE ========== */

  const treeRootSlugs = new Set(TREE.map((r) => r.slug));
  const dbRoots = childrenByParent.get(null) ?? [];
  const extraRoots = dbRoots.filter((r) => !treeRootSlugs.has(r.slug));
  if (extraRoots.length)
    console.log(
      `  (שורשים מחוץ ל-TREE — מתעלמים מתת-העצים שלהם: ${extraRoots.map((r) => r.slug).join(", ")})`,
    );

  const extras: DbCat[] = [];
  const pathOf = (c: DbCat): string => {
    const parts: string[] = [];
    let cur: DbCat | undefined = c;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.slug);
      cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
    }
    return parts.join("/");
  };
  const collectExtras = (parentId: number) => {
    for (const c of childrenByParent.get(parentId) ?? []) {
      if (!matchedIds.has(c.id)) extras.push(c);
      collectExtras(c.id);
    }
  };
  for (const root of dbRoots) if (treeRootSlugs.has(root.slug)) collectExtras(root.id);

  if (extras.length) {
    console.log(`⚠ עודפים: ${extras.length} קטגוריות ב-DB שאינן ב-TREE (ייתכן שנוצרו ע"י מנהלת):`);
    for (const e of extras) {
      const line = `extra: #${e.id} ${pathOf(e)} ("${e.title}")`;
      warn(line);
      console.log(`    - ${line}`);
    }
  } else {
    console.log("✓ עודפים: אין קטגוריות עודפות ב-DB תחת שורשי ה-TREE");
  }

  /* ========== 4ב. ספירת עלים ========== */

  const treeLeaves = countTreeLeaves(TREE);
  // עלים ב-DB בתוך תחום ה-TREE: צמתים שתואמים ל-TREE ואין להם ילדים ב-DB
  const dbLeaves = [...matchedIds].filter((id) => !(childrenByParent.get(id) ?? []).length).length;
  const leavesOk = missing === 0 && dbLeaves === treeLeaves;
  console.log(
    `${leavesOk ? "✓" : extras.length && missing === 0 ? "⚠" : "✗"} עלים: TREE=${treeLeaves}, DB (בתחום ה-TREE)=${dbLeaves}` +
      (leavesOk ? "" : " — הפרש עשוי לנבוע מצמתים חסרים או מקטגוריות עודפות תחת עלים"),
  );
  if (!leavesOk && missing === 0 && !extras.length)
    fail(`leaf count: TREE=${treeLeaves} אך ב-DB נמצאו ${dbLeaves} עלים בתחום ה-TREE`);

  /* ========== סיכום ========== */

  const dbInScope = matchedIds.size + extras.length;
  console.log("\n----------------------------------------");
  console.log(
    `סיכום: צמתים ב-TREE=${totalTree} | קטגוריות ב-DB=${rows.length} (בתחום ה-TREE=${dbInScope}) | ` +
      `כשלים=${failures.length} | אזהרות=${warnings.length}`,
  );
  if (failures.length) {
    console.log("\n✗ כשלים:");
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  if (warnings.length) {
    console.log(`\n⚠ אזהרות (${warnings.length}):`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  console.log(failures.length ? "\n✗ FAILED" : "\n✓ PASSED");
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
