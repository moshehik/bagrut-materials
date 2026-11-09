/**
 * שחזור גיבוי מסד הנתונים (ר' docs/db-backup.md). ברירת מחדל: dry-run (מדווח מה ייטען, לא כותב כלום).
 *   npx tsx scripts/restore-db-backup.ts <קובץ.json.gz | --drive latest | --drive <fileId>> --target <connection-string> [--apply] [--only t1,t2] [--allow-nonempty]
 * היעד חייב להיות מסד עם הסכמה קיימת (הטבלאות כבר נוצרו — סקריפטי scripts/create-*.ts / drizzle) וריק. שורות נטענות ב-json_populate_recordset
 * (שומר טיפוסים), לפי סדר מפתחות זרים (הורים לפני ילדים), בטרנזקציה אחת לכל טבלה. סדרות (serial) מסונכרנות בסוף.
 * אסור להפנות ל-DATABASE_URL של הייצור בלי --allow-nonempty מפורש ובלי לקרוא את הדוח.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { quoteIdent, sortTablesByFk } from "../src/lib/db-backup/logic";

type Backup = {
  format: string;
  tables: Record<string, { columns: { name: string; type: string }[]; pk: string[]; rows: Record<string, unknown>[] }>;
  meta: { totalRows: number; tables: { name: string; rows: number }[] };
};

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const arg = (f: string) => {
  const i = argv.indexOf(f);
  return i < 0 ? null : argv[i + 1] ?? null;
};

async function loadBackup(): Promise<Backup> {
  const drive = arg("--drive");
  let gz: Buffer;
  if (drive) {
    const { driveDownload } = await import("../src/lib/driveBridgeCore");
    let fileId = drive;
    if (drive === "latest") {
      const { listBackups } = await import("../src/lib/db-backup/run");
      const all = await listBackups();
      if (!all.length) throw new Error("אין גיבויים בדרייב");
      fileId = all[0].id;
      console.log("הגיבוי האחרון:", all[0].name);
    }
    gz = Buffer.from((await driveDownload(fileId, { maxBytes: 140 * 1024 * 1024 })).bytes);
  } else {
    const file = argv.find((a) => !a.startsWith("--") && a !== arg("--target") && a !== arg("--only"));
    if (!file) throw new Error("חסר קובץ גיבוי (או --drive latest)");
    gz = readFileSync(file);
  }
  const b = JSON.parse(gunzipSync(gz).toString("utf8")) as Backup;
  if (b.format !== "bagrut-db-backup/1") throw new Error(`פורמט לא מוכר: ${b.format}`);
  return b;
}

async function main() {
  const target = arg("--target");
  if (!target) throw new Error("חסר --target <connection-string> (מסד יעד — לא ברירת מחדל, כדי לא לדרוס בטעות)");
  const apply = has("--apply");
  const prod = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "");
  if (prod && target === prod && !has("--allow-nonempty")) throw new Error("היעד הוא מסד הייצור. שחזור לייצור דורש --allow-nonempty ואישור מפורש (ר' docs/db-backup.md)");
  const backup = await loadBackup();
  const only = arg("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(target);
  const q = async (text: string, params: unknown[] = []) => (await sql.query(text, params)) as Record<string, unknown>[];

  const existing = new Set((await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).map((r) => String(r.table_name)));
  const edges = (
    await q(`select tc.table_name as t, ccu.table_name as r from information_schema.table_constraints tc
             join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
             where tc.table_schema='public' and tc.constraint_type='FOREIGN KEY'`)
  ).map((r) => ({ table: String(r.t), refTable: String(r.r) }));

  const names = Object.keys(backup.tables).filter((t) => !only || only.includes(t));
  const { order, cyclic } = sortTablesByFk(names, edges);
  console.log(`גיבוי: ${names.length} טבלאות, ${backup.meta.totalRows} שורות. ${apply ? "מחיל" : "dry-run (בלי --apply לא נכתב כלום)"}`);
  if (cyclic.length) console.log("טבלאות במעגל מפתחות זרים (ייטענו בסוף, ייתכן שיידרשו טיפול ידני):", cyclic.join(", "));

  const problems: string[] = [];
  for (const t of order) {
    const data = backup.tables[t];
    if (!existing.has(t)) {
      problems.push(`${t}: הטבלה לא קיימת ביעד (${data.rows.length} שורות)`);
      continue;
    }
    const count = Number((await q(`select count(*)::int as n from ${quoteIdent(t)}`))[0].n);
    if (count > 0 && !has("--allow-nonempty")) {
      problems.push(`${t}: ביעד כבר יש ${count} שורות — מדלג (לא דורסים; --allow-nonempty לעקוף)`);
      continue;
    }
    console.log(`${t}: ${data.rows.length} שורות${apply ? "" : " (יטענו)"}`);
    if (!apply || !data.rows.length) continue;
    // חלקים של 2000 שורות; json_populate_recordset לפי טיפוסי הטבלה ביעד
    for (let i = 0; i < data.rows.length; i += 2000) {
      const chunk = data.rows.slice(i, i + 2000);
      await q(`insert into ${quoteIdent(t)} select * from json_populate_recordset(null::${quoteIdent(t)}, $1::json)`, [JSON.stringify(chunk)]);
    }
    // סנכרון סדרות (serial/identity) של עמודות מספריות בטבלה
    const seqs = await q(`select column_name, pg_get_serial_sequence(${"'" + quoteIdent(t).replace(/'/g, "''") + "'"}, column_name) as seq from information_schema.columns where table_schema='public' and table_name=$1`, [t]);
    for (const s of seqs) {
      if (s.seq) await q(`select setval($1, coalesce((select max(${quoteIdent(String(s.column_name))}) from ${quoteIdent(t)}), 1), (select count(*) > 0 from ${quoteIdent(t)}))`, [String(s.seq)]);
    }
    const after = Number((await q(`select count(*)::int as n from ${quoteIdent(t)}`))[0].n);
    if (after !== data.rows.length) problems.push(`${t}: אחרי הטעינה ${after} שורות במקום ${data.rows.length}`);
  }
  if (problems.length) {
    console.log("\nדורש תשומת לב:");
    for (const p of problems) console.log(" - " + p);
    process.exit(apply ? 2 : 0);
  }
  console.log(apply ? "\nהשחזור הושלם." : "\ndry-run נקי.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
