/**
 * "השיעור הראשון בכל נושא פתוח לכל מורה שנרשמה":
 * בכל תיקייה שיש בה לפחות MIN תיקיות-אחיות עם חומר פעיל, כל החומרים של התיקייה הראשונה (לפי sort ואז id)
 * מסומנים access='free'. חינם = נדרשת הרשמה (ההגדרה free_downloads_require_login).
 *
 *   npx tsx scripts/free-first-lesson.ts            ← תוכנית בלבד (לא כותב כלום)
 *   npx tsx scripts/free-first-lesson.ts --apply    ← מחיל, ושומר רשימת שחזור ב-_free_first_lesson_rollback.json
 *   npx tsx scripts/free-first-lesson.ts --rollback ← מחזיר ל-paid את מה שהוחל
 *
 * חוברות הערכה חלופית (מגילות וכו'): לא נפתחות החוברות עצמן (קבצי התיקייה של הספר), רק הפרק הראשון שבתוך כל ספר.
 */
import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
config({ path: ".env.local" });
config();

const MIN = 3;
const ROLLBACK = "_free_first_lesson_rollback.json";
const EXCLUDE_PARENT_TITLE_PARTS = ["חלופות כתובים"];

type Cat = { id: number; parent_id: number | null; title: string; sort: number; status: string };

async function main() {
  const { db } = await import("../src/db");
  const { sql, inArray, and, eq } = await import("drizzle-orm");
  const { materials } = await import("../src/db/schema");

  if (process.argv.includes("--rollback")) {
    const ids: number[] = JSON.parse(readFileSync(ROLLBACK, "utf8")).ids;
    await db.update(materials).set({ access: "paid" }).where(and(inArray(materials.id, ids), eq(materials.access, "free")));
    console.log("הוחזרו ל-paid:", ids.length);
    return;
  }

  const cats = (await db.execute(sql`SELECT id,parent_id,title,sort,status FROM categories`)).rows as unknown as Cat[];
  const mats = (await db.execute(
    // כל החומרים הפעילים (גם אלה שכבר חינמיים) – כדי ש"הראשון" לא יקפוץ לפרק הבא אחרי שהראשון כבר נפתח.
    // העדכון עצמו נוגע רק בקבצים שעדיין בתשלום
    sql`SELECT id, category_id FROM materials WHERE status='active' ORDER BY id`,
  )).rows as unknown as { id: number; category_id: number }[];
  const byCat = new Map<number, number[]>();
  for (const m of mats) (byCat.get(m.category_id) ?? byCat.set(m.category_id, []).get(m.category_id)!).push(m.id);

  const by = new Map(cats.map((c) => [c.id, c] as const));
  const kids = new Map<number, Cat[]>();
  for (const c of cats.filter((c) => c.status === "active" && c.parent_id !== null)) {
    (kids.get(c.parent_id!) ?? kids.set(c.parent_id!, []).get(c.parent_id!)!).push(c);
  }
  kids.forEach((a) => a.sort((x, y) => x.sort - y.sort || x.id - y.id));
  const pathOf = (c: Cat) => {
    const p: string[] = [];
    for (let x: Cat | undefined = c; x; x = x.parent_id ? by.get(x.parent_id) : undefined) p.unshift(x.title);
    return p.join(" ← ");
  };

  const ids: number[] = [];
  const lines: string[] = [];
  for (const arr of kids.values()) {
    const withMat = arr.filter((c) => (byCat.get(c.id)?.length ?? 0) > 0);
    if (withMat.length < MIN) continue;
    const first = withMat[0];
    const path = pathOf(first);
    // בחלופות כתובים ההורה הוא "רשימת הספרים" וכל ספר מחזיק חוברת משלו – לא פותחים את החוברות, רק את הפרק הראשון בתוך כל ספר
    const parentTitle = by.get(first.parent_id!)?.title ?? "";
    if (EXCLUDE_PARENT_TITLE_PARTS.some((x) => parentTitle.includes(x))) continue;
    const own = byCat.get(first.id)!;
    ids.push(...own);
    lines.push(`${own.length}\t${path}`);
  }
  lines.sort();
  console.log(lines.join("\n"));
  console.log(`\nתיקיות: ${lines.length} | קבצים שייפתחו: ${ids.length}`);

  if (process.argv.includes("--apply")) {
    // קודם העדכון, ורק אחריו רשימת השחזור – כדי שלא תישאר רשימה של קבצים שלא שונו
    await db.update(materials).set({ access: "free" }).where(and(inArray(materials.id, ids), eq(materials.access, "paid")));
    const prev = existsSync(ROLLBACK) ? (JSON.parse(readFileSync(ROLLBACK, "utf8")).ids as number[]) : [];
    writeFileSync(ROLLBACK, JSON.stringify({ at: new Date().toISOString(), ids: [...new Set([...prev, ...ids])] }));
    console.log("הוחל. רשימת שחזור:", ROLLBACK);
  } else {
    console.log("(תוכנית בלבד – לא שונה כלום. להחלה: --apply)");
  }
}
main().then(() => process.exit(0));
