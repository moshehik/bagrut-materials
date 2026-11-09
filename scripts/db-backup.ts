/**
 * גיבוי מסד הנתונים (Neon) — כלי שורת פקודה. ר' docs/db-backup.md.
 *   npx tsx scripts/db-backup.ts --run [--force]     גיבוי מלא לדרייב (אותו קוד שהכרון מריץ), כולל שימור
 *   npx tsx scripts/db-backup.ts --local <קובץ.json.gz>   גיבוי לקובץ מקומי בלבד (בלי דרייב, בלי לכתוב ל-DB)
 *   npx tsx scripts/db-backup.ts --status            מצב אחרון + רשימת הקבצים בדרייב
 * (NODE_OPTIONS=--use-system-ca במחשב של המורה.)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const arg = (f: string) => {
  const i = argv.indexOf(f);
  return i < 0 ? null : argv[i + 1] ?? null;
};

async function main() {
  if (has("--local")) {
    const out = arg("--local");
    if (!out) throw new Error("חסר נתיב קובץ אחרי --local");
    const { dumpDatabase, neonQueryFn } = await import("../src/lib/db-backup/dump");
    const url = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "");
    if (!url) throw new Error("DATABASE_URL לא מוגדר");
    const r = await dumpDatabase(await neonQueryFn(url), { log: (s) => console.log("  " + s) });
    writeFileSync(out, r.gz);
    console.log(`נכתב ${out}: ${r.tables.length} טבלאות, ${r.totalRows} שורות, ${r.gz.length} בייטים דחוסים`);
    return;
  }
  if (has("--run")) {
    const { runDbBackup } = await import("../src/lib/db-backup/run");
    const r = await runDbBackup({ force: has("--force"), trigger: "cli" });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.status === "failed" ? 2 : 0);
  }
  if (has("--status")) {
    const { getBackupState, listBackups } = await import("../src/lib/db-backup/run");
    console.log(JSON.stringify(await getBackupState(), null, 2));
    for (const b of await listBackups()) console.log(b.at.toISOString(), b.name, b.id);
    return;
  }
  console.log("שימוש: --run [--force] | --local <קובץ> | --status");
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
