/**
 * אימות שהגיבוי האחרון בדרייב תקין: מוריד, פותח, ומשווה ספירת שורות לכל טבלה מול המסד החי.
 *   npx tsx scripts/verify-db-backup.ts [--drive <fileId>]
 * טבלאות שרק גדלות (לוגים) יכולות להיות גדולות ב"חי" משום שנוספו אחרי הגיבוי; קטן ב"חי" מהגיבוי (או טבלה חסרה) מסומן. ר' docs/db-backup.md.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { gunzipSync } from "node:zlib";
import { quoteIdent } from "../src/lib/db-backup/logic";

async function main() {
  const { driveDownload } = await import("../src/lib/driveBridgeCore");
  const { listBackups } = await import("../src/lib/db-backup/run");
  const { neonQueryFn } = await import("../src/lib/db-backup/dump");
  const i = process.argv.indexOf("--drive");
  let fileId = i >= 0 ? process.argv[i + 1] : "";
  let name = fileId;
  if (!fileId) {
    const all = await listBackups();
    if (!all.length) throw new Error("אין גיבויים בדרייב");
    fileId = all[0].id;
    name = all[0].name;
  }
  const dl = await driveDownload(fileId, { maxBytes: 140 * 1024 * 1024 });
  const b = JSON.parse(gunzipSync(Buffer.from(dl.bytes)).toString("utf8")) as {
    format: string;
    tables: Record<string, { rows: unknown[] }>;
    meta: { totalRows: number; tables: { name: string; rows: number }[] };
  };
  if (b.format !== "bagrut-db-backup/1") throw new Error(`פורמט לא מוכר: ${b.format}`);
  const url = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "");
  if (!url) throw new Error("DATABASE_URL לא מוגדר");
  const q = await neonQueryFn(url);
  let bad = 0;
  let sum = 0;
  for (const t of b.meta.tables) {
    const inFile = b.tables[t.name]?.rows.length ?? -1;
    sum += inFile;
    if (inFile !== t.rows) {
      console.log(`✗ ${t.name}: בקובץ ${inFile} שורות אבל ה-meta אומר ${t.rows}`);
      bad++;
      continue;
    }
    let live = -1;
    try {
      live = Number((await q(`select count(*)::int as n from ${quoteIdent(t.name)}`))[0].n);
    } catch {
      /* טבלה שנמחקה מאז */
    }
    const note = live === inFile ? "זהה" : live > inFile ? `חי גדול ב-${live - inFile} (נוסף מאז)` : live < 0 ? "לא קיימת בחי" : `⚠ חי קטן ב-${inFile - live} (נמחק מאז?)`;
    if (live >= 0 && live < inFile) bad++;
    console.log(`${live === inFile || live > inFile ? "✓" : "•"} ${t.name}: גיבוי ${inFile}, חי ${live} — ${note}`);
  }
  console.log(`\n${name}: ${b.meta.tables.length} טבלאות, ${sum} שורות בקובץ (meta: ${b.meta.totalRows}). ${bad ? `${bad} נקודות לבדיקה` : "הקובץ שלם וקריא."}`);
  process.exit(bad ? 2 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
