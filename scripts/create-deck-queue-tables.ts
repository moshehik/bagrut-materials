/**
 * חד-פעמי: יוצר את deck_jobs ו-deck_queue_state (תור הפקת תמונות למצגות בנוטבוק, כרון של Vercel). IF NOT EXISTS – בטוח להריץ שוב.
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי. חובה להריץ ב-Neon לפני שדוחפים את הקוד (הכרון רץ כל דקה ומצפה לטבלאות).
 * dry-run כברירת מחדל: `npx tsx scripts/create-deck-queue-tables.ts`; הרצה אמיתית: `... --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS deck_jobs (
  id varchar(120) PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  source_text text NOT NULL,
  description text NOT NULL,
  stage varchar(12) NOT NULL DEFAULT 'new',
  notebook_id text,
  oracle_job_id text,
  artifact_id text,
  poll_errors integer NOT NULL DEFAULT 0,
  tries integer NOT NULL DEFAULT 0,
  retry_after timestamp,
  started_at timestamp,
  images_file_id text,
  images_bytes integer,
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp
)`,
  `CREATE INDEX IF NOT EXISTS deck_jobs_stage_idx ON deck_jobs (stage, created_at)`,
  `CREATE TABLE IF NOT EXISTS deck_queue_state (
  id integer PRIMARY KEY,
  kill_switch boolean NOT NULL DEFAULT false,
  max_concurrent integer NOT NULL DEFAULT 5,
  lock_until timestamp,
  lock_owner text,
  last_tick_at timestamp,
  last_tick_summary text,
  last_error text,
  ticks integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now()
)`,
  // טבלאות שנוצרו לפני תוספת העמודות
  `ALTER TABLE deck_jobs ADD COLUMN IF NOT EXISTS artifact_id text`,
  `ALTER TABLE deck_jobs ADD COLUMN IF NOT EXISTS poll_errors integer NOT NULL DEFAULT 0`,
  `ALTER TABLE deck_queue_state ADD COLUMN IF NOT EXISTS lock_owner text`,
  // מתחיל במתג חירום דלוק: הכרון לא מתחיל כלום עד שמפעילים במפורש (deck-queue.ts resume)
  `INSERT INTO deck_queue_state (id, kill_switch) VALUES (1, true) ON CONFLICT (id) DO NOTHING`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${new URL(url).host}`);
  console.log(`מצב: ${apply ? "APPLY" : "dry-run – רק מדפיס (הוסיפי --apply להרצה)"}\n${STATEMENTS.join(";\n")};`);
  if (!apply) return;
  const sql = neon(url);
  for (const s of STATEMENTS) await sql.query(s);
  console.log("הושלם: deck_jobs, deck_queue_state (kill_switch=true עד resume)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
