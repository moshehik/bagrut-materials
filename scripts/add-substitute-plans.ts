/**
 * חד-פעמי: מוסיף למסד ערכי מסלול חדשים (ממלאת מקום 3 חודשים / יומית) ועמודת term_days ל-purchases
 * (מנוי שמתחיל בהורדה הראשונה: endsAt ריק עד אז, ובהורדה הראשונה = עכשיו + term_days).
 * `db:push` שבור כאן – SQL גולמי. מוסיף בלבד, בטוח להריץ שוב. הרצה: npx tsx scripts/add-substitute-plans.ts
 * חובה להריץ לפני פריסה של הקוד שמשתמש בהם.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`ALTER TYPE plan ADD VALUE IF NOT EXISTS 'substitute_3m'`);
  await db.execute(sql`ALTER TYPE plan ADD VALUE IF NOT EXISTS 'substitute_daily'`);
  await db.execute(sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS term_days integer`);
  console.log("substitute plans + purchases.term_days ready");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
