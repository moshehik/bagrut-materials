/**
 * זריעת עץ הקטגוריות + משתמש מנהל.
 * הרצה: npx tsx scripts/seed.ts   (או: npm run db:seed)
 * אידמפוטנטי: upsert לפי (parent, slug).
 * SEED_DEMO=1 → זורע גם כמה חומרי דמו תחת כתובים/תהילים/פרק א'.
 */
import "dotenv/config";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";
import { SUBJECT_ICONS } from "../src/lib/constants";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}
const db = drizzle(neon(url), { schema });
const { categories, materials, users } = schema;

/* ---------- tree definition ---------- */

type Node = {
  slug: string;
  title: string;
  questionnaireCode?: string;
  bundlePrice?: number;
  description?: string;
  children?: Node[];
};

const PALETTE = ["#2f6fed", "#f472b6", "#b98555", "#d4a017", "#1d4ed8", "#ec4899", "#8a5a2b"];

const perakim = (list: [string, string][]): Node[] =>
  list.map(([slug, title]) => ({ slug, title }));
const perek123 = perakim([
  ["perek-1", "פרק א'"],
  ["perek-2", "פרק ב'"],
  ["perek-3", "פרק ג'"],
]);

const unitsPlaceholder: Node[] = [
  { slug: "3-units", title: "בגרות 3 יחידות" },
  { slug: "5-units", title: "בגרות 5 יחידות" },
];
const intExtPlaceholder: Node[] = [
  { slug: "internal", title: "בגרות פנימית" },
  { slug: "external", title: "בגרות חיצונית" },
];

const TREE: Node[] = [
  {
    slug: "torah",
    title: "תורה",
    children: [
      {
        slug: "3-units",
        title: "בגרות 3 יחידות",
        questionnaireCode: "001281",
        children: [
          { slug: "internal", title: "בגרות פנימית" },
          {
            slug: "external",
            title: "בגרות חיצונית",
            children: [
              { slug: "shemot", title: "פרשת שמות", children: perek123 },
              { slug: "devarim", title: "פרשת דברים", children: perek123 },
              { slug: "vaetchanan", title: "פרשת ואתחנן", children: perek123 },
            ],
          },
        ],
      },
      {
        slug: "5-units",
        title: "בגרות 5 יחידות",
        questionnaireCode: "001291",
        children: [
          { slug: "internal", title: "בגרות פנימית" },
          {
            slug: "external",
            title: "בגרות חיצונית",
            children: [
              {
                slug: "devarim",
                title: "פרשת דברים",
                bundlePrice: 9900,
                children: [
                  { slug: "hakdamat-haramban", title: 'הקדמת הרמב"ן' },
                  ...perek123,
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { slug: "navi", title: "נביא", children: unitsPlaceholder },
  {
    slug: "ktuvim",
    title: "כתובים",
    children: [
      {
        slug: "tehilim",
        title: "תהילים",
        questionnaireCode: "001xxx",
        children: perakim([
          ["perek-1", "פרק א'"],
          ["perek-19", 'פרק י"ט'],
          ["perek-24", 'פרק כ"ד'],
          ["perek-27", 'פרק כ"ז'],
          ["perek-29", 'פרק כ"ט'],
          ["perek-30", "פרק ל'"],
          ["perek-34", 'פרק ל"ד'],
          ["perek-47", 'פרק מ"ז'],
        ]),
      },
      { slug: "megilat-esther", title: "מגילת אסתר – הערכה חלופית" },
    ],
  },
  {
    slug: "lashon",
    title: "לשון",
    children: [
      {
        slug: "internal",
        title: "בגרות פנימית",
        children: [
          {
            slug: "internal-material",
            title: "חומר להיבחנות פנימית",
            children: [
              { slug: "chelkei-dibur", title: "חלקי דיבר" },
              {
                slug: "gzarot",
                title: "גזרות",
                children: [
                  { slug: "hagroniyot", title: "הגרוניות" },
                  { slug: "merubaim", title: "מרובעים" },
                  { slug: "nafyo", title: 'נפ"יו' },
                  { slug: "chafan", title: 'חפ"ן' },
                  { slug: "nala", title: 'נל"א' },
                  { slug: "nalyeh", title: 'נל"י/ה' },
                  { slug: "naoy", title: 'נע"ו/י' },
                ],
              },
              { slug: "darchei-tzura", title: "דרכי תצורה" },
              { slug: "beinoni", title: "בינוני" },
            ],
          },
          {
            slug: "talkit",
            title: "תלקיט",
            children: [{ slug: "talkitim-lebchira", title: "תלקיטים לבחירה" }],
          },
        ],
      },
      {
        slug: "external",
        title: "בגרות חיצונית",
        children: [
          { slug: "tachbir", title: "תחביר" },
          { slug: "havanat-hanikra", title: "הבנת הנקרא" },
          { slug: "hava'a", title: "הבעה" },
        ],
      },
    ],
  },
  { slug: "sifrut", title: "ספרות", children: unitsPlaceholder },
  { slug: "english", title: "אנגלית", children: unitsPlaceholder },
  { slug: "yahadut", title: "יהדות", children: intExtPlaceholder },
  { slug: "math", title: "מתמטיקה", children: unitsPlaceholder },
  { slug: "dinim", title: "דינים", children: intExtPlaceholder },
  { slug: "history", title: "היסטוריה", children: unitsPlaceholder },
  { slug: "ezrachut", title: "אזרחות", children: unitsPlaceholder },
  { slug: "sicha", title: "שיחה", children: intExtPlaceholder },
  { slug: "chevra", title: "חברה", children: intExtPlaceholder },
  { slug: "teacher", title: "הרחבת ידע למורה", children: unitsPlaceholder },
];

/* ---------- upsert ---------- */

const stats = { inserted: 0, updated: 0 };

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
  const [existing] = await db.select({ id: categories.id }).from(categories).where(cond).limit(1);

  const values = {
    parentId,
    slug: node.slug,
    title: node.title,
    description: node.description ?? null,
    questionnaireCode: node.questionnaireCode ?? null,
    bundlePrice: node.bundlePrice ?? null,
    icon: extra.icon ?? null,
    color: extra.color ?? null,
    sort,
  };

  let id: number;
  if (existing) {
    await db.update(categories).set(values).where(eq(categories.id, existing.id));
    id = existing.id;
    stats.updated++;
  } else {
    const [row] = await db.insert(categories).values(values).returning({ id: categories.id });
    id = row.id;
    stats.inserted++;
  }

  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    await upsertCategory(children[i], id, (i + 1) * 10);
  }
  return id;
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
    premiumOnly: boolean;
  }[] = [
    { title: "דף שכפול לתלמידה – תהילים פרק א'", kind: "student_sheet", fileName: "תהילים א לתלמיד.pdf", price: 1500, premiumOnly: false },
    { title: "דף שכפול למורה – תהילים פרק א'", kind: "teacher_sheet", fileName: "תהילים א למורה.pdf", price: 2500, premiumOnly: false },
    { title: "מצגת מלווה – תהילים פרק א'", kind: "presentation", fileName: "תהילים א מצגת.pptx", price: 2000, premiumOnly: true },
    { title: "שאלות מבגרויות קודמות – תהילים פרק א'", kind: "past_exam", fileName: "תהילים א בגרות.pdf", price: 1800, premiumOnly: true },
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
      premiumOnly: d.premiumOnly,
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
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Admin1234!";
  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    email,
    passwordHash,
    name: "מנהל האתר",
    role: "admin",
    tier: "diamond",
    personalCode: "ADMN-0001",
  });
  return { email, created: true, password };
}

async function main() {
  console.log("Seeding categories…");
  for (let i = 0; i < TREE.length; i++) {
    const n = TREE[i];
    await upsertCategory(n, null, (i + 1) * 10, {
      icon: SUBJECT_ICONS[n.slug] ?? "📁",
      color: PALETTE[i % PALETTE.length],
    });
  }
  console.log(`Categories: ${stats.inserted} inserted, ${stats.updated} updated`);

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
