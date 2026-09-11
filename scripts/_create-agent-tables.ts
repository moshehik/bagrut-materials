/**
 * חד-פעמי: יוצר את הטבלאות/enums של מערכת ה-fix-reports (error_reports,
 * error_report_notes, agent_loop_status) ישירות ב-SQL גולמי, כי `npm run db:push`
 * נכשל בשלב האינטרוספקציה על הסביבה הזו (שגיאה לא קשורה: "cannot drop view
 * pg_stat_statements_info because extension pg_stat_statements requires it" —
 * drizzle-kit מנסה לנהל view שקשור ל-extension מובנה של Neon, לא קשור לסכימה
 * שלנו). כל הפקודות IF NOT EXISTS / DO-guarded — בטוח להריץ שוב.
 * הרצה: npx tsx scripts/_create-agent-tables.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE error_report_status AS ENUM ('OPEN', 'ARCHIVED');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE error_report_kind AS ENUM ('report', 'agentLog');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE error_report_note_role AS ENUM ('support', 'reporter');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS error_reports (
    id varchar(36) PRIMARY KEY,
    status error_report_status NOT NULL DEFAULT 'OPEN',
    kind error_report_kind NOT NULL DEFAULT 'report',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    time varchar(100),
    url varchar(500),
    title varchar(200),
    query_params varchar(500),
    last_buttons text,
    user_text text NOT NULL
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS error_reports_status_idx ON error_reports (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS error_reports_kind_idx ON error_reports (kind)`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS error_report_notes (
    id varchar(36) PRIMARY KEY,
    report_id varchar(36) NOT NULL REFERENCES error_reports(id) ON DELETE CASCADE,
    text text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    role error_report_note_role NOT NULL DEFAULT 'support',
    is_question boolean NOT NULL DEFAULT false,
    preview_url varchar(500)
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS error_report_notes_report_idx ON error_report_notes (report_id)`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS agent_loop_status (
    id integer PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT false,
    last_activity_at timestamp
  )`);

  console.log("OK: agent-system tables ready (error_reports, error_report_notes, agent_loop_status)");
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
