/**
 * חד-פעמי: יוצר את טבלת agent_events (יומן הסוכן) ב-SQL גולמי — db:push שבור בסביבה הזו
 * (ר' _create-agent-tables.ts). IF NOT EXISTS — בטוח להריץ שוב.
 * הרצה: npx tsx scripts/_create-agent-events.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS agent_events (
    id serial PRIMARY KEY,
    run_id varchar(64),
    source varchar(20) NOT NULL,
    kind varchar(30) NOT NULL,
    summary text NOT NULL,
    details text,
    report_id varchar(36),
    actor_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agent_events_created_idx ON agent_events (created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agent_events_run_idx ON agent_events (run_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agent_events_kind_idx ON agent_events (kind)`);
  console.log("OK: agent_events מוכנה");
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
