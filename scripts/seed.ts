/**
 * זריעת עץ הקטגוריות + משתמש מנהל.
 * הרצה: npx tsx scripts/seed.ts   (או: npm run db:seed)
 * אידמפוטנטי: upsert לפי (parent, slug).
 * SEED_DEMO=1  → זורע גם כמה חומרי דמו תחת כתובים/תהילים/פרק א'.
 * SEED_PRUNE=1 → מוחק קטגוריות ישנות שאינן בעץ הנוכחי (רק אם אין חומרים בתת-העץ שלהן).
 *
 * מקורות התוכן: תכניות הלימודים הרשמיות של הפיקוח החרדי (תשפ"ו) —
 * תנ"ך 3/5 יח"ל, יהדות ודינים 3/5 יח"ל, ספרות, היסטוריה, אזרחות, מנהל וכלכלה 30%/70% —
 * וכן לוח הבגרויות הבית-ספרי תשפ"ו (סמלי שאלונים במתמטיקה, אנגלית ולשון).
 */
import "dotenv/config";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";
import { SUBJECT_ICONS, SUBJECT_COLORS } from "../src/lib/constants";
import { TREE, type Node } from "./curriculum-tree";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}
const db = drizzle(neon(url), { schema });
const { categories, materials, users } = schema;

/** צבע חלופי למקצוע שאינו במפת הצבעים */
const FALLBACK_COLOR = "#b98555";

/* ---------- upsert ---------- */

const stats = { inserted: 0, updated: 0 };
const keepIds = new Set<number>();

/** ניסיון חוזר לפעולות DB — הרשת לניאון נופלת לעיתים תחת עומס קריאות רצופות */
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

async function upsertCategory(
  node: Node,
  parentId: number | null,
  sort: number,
  extra: { icon?: string; color?: string } = {},
): Promise<number> {
  const cond =
    parentId === null
      ? and(isNull(categories.parentId), eq(categories.slug, node.slug))
      : and(eq(categories.parentId, parentId), eq(categories.slug, node.slug));
  const [existing] = await withRetry(
    () => db.select({ id: categories.id }).from(categories).where(cond).limit(1),
    `select ${node.slug}`,
  );

  const values = {
    parentId,
    slug: node.slug,
    title: node.title,
    description: node.description ?? null,
    questionnaireCode: node.questionnaireCode ?? null,
    bundlePrice: node.bundlePrice ?? null,
    excluded: node.excluded ?? false,
    excludedNote: node.excludedNote ?? null,
    ready: node.ready ?? false,
    contentModule: (node.moduleType ?? "standard") as "standard" | "sichot",
    icon: extra.icon ?? null,
    color: extra.color ?? null,
    sort,
  };

  let id: number;
  if (existing) {
    await withRetry(
      () => db.update(categories).set(values).where(eq(categories.id, existing.id)),
      `update ${node.slug}`,
    );
    id = existing.id;
    stats.updated++;
  } else {
    const [row] = await withRetry(
      () => db.insert(categories).values(values).returning({ id: categories.id }),
      `insert ${node.slug}`,
    );
    id = row.id;
    stats.inserted++;
  }
  keepIds.add(id);

  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    await upsertCategory(children[i], id, (i + 1) * 10);
  }
  return id;
}

/* ---------- prune: מחיקת קטגוריות ישנות שאינן בעץ (רק ללא חומרים) ---------- */

async function pruneStale(seededRootIds: number[]) {
  const allCats = await db
    .select({ id: categories.id, parentId: categories.parentId, title: categories.title })
    .from(categories);
  const byParent = new Map<number, { id: number; title: string }[]>();
  for (const c of allCats) {
    if (c.parentId === null) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push({ id: c.id, title: c.title });
    byParent.set(c.parentId, list);
  }
  const mats = await db.select({ categoryId: materials.categoryId }).from(materials);
  const hasMaterial = new Set(mats.map((m) => m.categoryId));
  // רכישות שמפנות לקטגוריה: מחיקה הייתה מאפסת להן את הקטגוריה ומשבשת הרשאות
  const purch = await db
    .select({ categoryId: schema.purchases.categoryId })
    .from(schema.purchases);
  for (const p of purch) if (p.categoryId !== null) hasMaterial.add(p.categoryId);

  const subtreeHasMaterials = (id: number): boolean => {
    if (hasMaterial.has(id)) return true;
    return (byParent.get(id) ?? []).some((c) => subtreeHasMaterials(c.id));
  };

  // איסוף למחיקה: עמוק-קודם, כדי שילדים יימחקו לפני הורים
  const toDelete: { id: number; title: string }[] = [];
  const collect = (id: number, title: string) => {
    for (const child of byParent.get(id) ?? []) collect(child.id, child.title);
    toDelete.push({ id, title });
  };
  const walk = (id: number) => {
    for (const child of byParent.get(id) ?? []) {
      if (keepIds.has(child.id)) {
        walk(child.id);
      } else if (subtreeHasMaterials(child.id)) {
        console.warn(`prune: skipping "${child.title}" (subtree has materials)`);
      } else {
        collect(child.id, child.title);
      }
    }
  };
  for (const rootId of seededRootIds) walk(rootId);

  for (const { id, title } of toDelete) {
    await withRetry(() => db.delete(categories).where(eq(categories.id, id)), `delete ${title}`);
    console.log(`prune: deleted "${title}"`);
  }
  return toDelete.length;
}

async function findByPath(path: string[]): Promise<number | null> {
  let parentId: number | null = null;
  for (const slug of path) {
    const cond: SQL | undefined =
      parentId === null
        ? and(isNull(categories.parentId), eq(categories.slug, slug))
        : and(eq(categories.parentId, parentId), eq(categories.slug, slug));
    const [c]: { id: number }[] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(cond)
      .limit(1);
    if (!c) return null;
    parentId = c.id;
  }
  return parentId;
}

async function seedDemoMaterials() {
  const catId = await findByPath(["ktuvim", "tehilim", "perek-1"]);
  if (!catId) {
    console.warn("demo: category ktuvim/tehilim/perek-1 not found");
    return 0;
  }
  const demos: {
    title: string;
    kind: schema.MaterialKind;
    fileName: string;
    price: number;
  }[] = [
    { title: "דף שכפול לתלמידה – תהילים פרק א'", kind: "student_sheet", fileName: "תהילים א לתלמיד.pdf", price: 1500 },
    { title: "דף שכפול למורה – תהילים פרק א'", kind: "teacher_sheet", fileName: "תהילים א למורה.pdf", price: 2500 },
    { title: "מצגת מלווה – תהילים פרק א'", kind: "presentation", fileName: "תהילים א מצגת.pptx", price: 2000 },
    { title: "שאלות מבגרויות קודמות – תהילים פרק א'", kind: "past_exam", fileName: "תהילים א בגרות.pdf", price: 1800 },
  ];
  let n = 0;
  for (let i = 0; i < demos.length; i++) {
    const d = demos[i];
    const [exists] = await db
      .select({ id: materials.id })
      .from(materials)
      .where(and(eq(materials.categoryId, catId), eq(materials.title, d.title)))
      .limit(1);
    if (exists) continue;
    await db.insert(materials).values({
      categoryId: catId,
      title: d.title,
      description: "חומר דמו לתצוגה בלבד",
      kind: d.kind,
      fileUrl: "https://example.com/demo.pdf",
      fileName: d.fileName,
      mime: d.fileName.endsWith(".pptx")
        ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        : "application/pdf",
      size: 245_000,
      price: d.price,
      sort: (i + 1) * 10,
    });
    n++;
  }
  return n;
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)[0];
  if (!email) {
    console.warn("ADMIN_EMAILS not set – skipping admin user");
    return { email: null, created: false };
  }
  const [exists] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
  if (exists) {
    if (exists.role !== "admin") {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, exists.id));
    }
    return { email, created: false };
  }
  // אין סיסמת ברירת מחדל בקוד (ה-repo עשוי להיות ציבורי): בלי SEED_ADMIN_PASSWORD נוצרת סיסמה אקראית, והכניסה היא עם גוגל / "שכחתי סיסמה".
  const password = process.env.SEED_ADMIN_PASSWORD ?? (await import("node:crypto")).randomBytes(24).toString("hex");
  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    email,
    passwordHash,
    name: "מנהל האתר",
    role: "admin",
    personalCode: "ADMN-0001",
  });
  return { email, created: true, password };
}

async function main() {
  console.log("Seeding categories…");
  const rootIds: number[] = [];
  for (let i = 0; i < TREE.length; i++) {
    const n = TREE[i];
    const id = await upsertCategory(n, null, (i + 1) * 10, {
      icon: SUBJECT_ICONS[n.slug] ?? "📁",
      color: SUBJECT_COLORS[n.slug] ?? FALLBACK_COLOR,
    });
    rootIds.push(id);
  }
  console.log(`Categories: ${stats.inserted} inserted, ${stats.updated} updated`);

  if (process.env.SEED_PRUNE === "1") {
    const n = await pruneStale(rootIds);
    console.log(`Pruned stale categories: ${n}`);
  }

  if (process.env.SEED_DEMO === "1") {
    const n = await seedDemoMaterials();
    console.log(`Demo materials inserted: ${n}`);
  }

  const admin = await seedAdmin();
  if (admin.email) {
    console.log(
      admin.created
        ? `Admin user created: ${admin.email} / ${admin.password}`
        : `Admin user exists: ${admin.email}`,
    );
  }

  const c = (await db.select({ id: categories.id }).from(categories)).length;
  const m = (await db.select({ id: materials.id }).from(materials)).length;
  const u = (await db.select({ id: users.id }).from(users)).length;
  console.log(`Totals → categories: ${c}, materials: ${m}, users: ${u}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
