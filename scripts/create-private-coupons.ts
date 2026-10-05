/**
 * חד-פעמי: יוצר את טבלת private_coupons (קופונים פרטיים של המנהלת) ב-SQL גולמי —
 * `npm run db:push` נכשל על הסביבה הזו. IF NOT EXISTS – בטוח להריץ שוב.
 * חובה להריץ לפני push (push מפרוס מיד). הרצה: npx tsx scripts/create-private-coupons.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS private_coupons (
    id serial PRIMARY KEY,
    code varchar(24) NOT NULL,
    email varchar(255),
    label varchar(120) NOT NULL,
    benefit varchar(12) NOT NULL,
    percent integer,
    subject_ids text,
    days integer,
    expires_at timestamp,
    status varchar(10) NOT NULL DEFAULT 'active',
    claimed_by integer REFERENCES users(id) ON DELETE SET NULL,
    used_at timestamp,
    note text,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS private_coupons_code_idx ON private_coupons (code)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS private_coupons_email_idx ON private_coupons (email)`);
  console.log("private_coupons ready");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
