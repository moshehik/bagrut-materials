/**
 * חד-פעמי: יוצר את טבלת material_fixes (בקשות שינוי/תיקונים לקבצים) ב-SQL גולמי —
 * `npm run db:push` נכשל על הסביבה הזו (ר' הערה ב-scripts/_create-agent-tables.ts).
 * IF NOT EXISTS – בטוח להריץ שוב. הרצה: npx tsx scripts/create-fix-tables.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS material_fixes (
    id serial PRIMARY KEY,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    user_id integer REFERENCES users(id) ON DELETE SET NULL,
    request_text text NOT NULL,
    quote_text text,
    status varchar(12) NOT NULL DEFAULT 'pending',
    fix_number integer,
    original_text text,
    corrected_text text,
    admin_note text,
    published_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS material_fixes_material_idx ON material_fixes (material_id)`);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS material_fixes_number_idx ON material_fixes (material_id, fix_number)`,
  );
  console.log("material_fixes ready");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
