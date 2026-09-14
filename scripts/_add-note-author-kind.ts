/**
 * חד-פעמי: מוסיף את עמודת error_report_notes.author_kind (+ ה-enum שלה) ישירות
 * ב-SQL גולמי, מאותה סיבה ש-scripts/_create-agent-tables.ts לא משתמש ב-`db:push`
 * (drizzle-kit נכשל בשלב האינטרוספקציה מול pg_stat_statements ב-Neon). כל הפקודות
 * IF NOT EXISTS / DO-guarded — בטוח להריץ שוב.
 *
 * מבצע גם backfill לשורות קיימות: role="support" בלי author_kind מסומן כ-'agent'
 * (זו הייתה ההתנהגות היחידה האפשרית לפני העמודה הזו לגבי לוגיקת הסיווג של
 * fix-reports.md, ור' שם למה admin מסומן אחרת מעכשיו).
 *
 * הרצה: npx tsx scripts/_add-note-author-kind.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE error_report_note_author_kind AS ENUM ('agent', 'admin');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`);

  await db.execute(
    sql`ALTER TABLE error_report_notes ADD COLUMN IF NOT EXISTS author_kind error_report_note_author_kind`
  );

  const result = await db.execute(
    sql`UPDATE error_report_notes SET author_kind = 'agent' WHERE role = 'support' AND author_kind IS NULL`
  );

  console.log(`OK: error_report_notes.author_kind ready (backfilled ${result.rowCount ?? 0} existing support notes as 'agent')`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
