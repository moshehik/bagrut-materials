/**
 * חד-פעמי: יוצר את טבלת rate_limits (מוני הגבלת-קצב של src/lib/rate-limit.ts) ב-SQL גולמי —
 * `npm run db:push` נכשל על הסביבה הזו (ר' הערה ב-scripts/_create-agent-tables.ts).
 * IF NOT EXISTS – בטוח להריץ שוב. הרצה: npx tsx scripts/create-rate-limits-table.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS rate_limits (
    key varchar(160) PRIMARY KEY,
    count integer NOT NULL DEFAULT 0,
    reset_at timestamp NOT NULL
  )`);
  const [row] = (await db.execute(sql`SELECT count(*)::int AS n FROM rate_limits`)).rows as { n: number }[];
  console.log(`rate_limits ready (${row?.n ?? 0} rows)`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
