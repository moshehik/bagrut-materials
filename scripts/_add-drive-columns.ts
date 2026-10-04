/**
 * חד-פעמי: עמודות לארגון הדרייב כעץ תיקיות (db:push שבור כאן — SQL גולמי, IF NOT EXISTS).
 *  categories.drive_folder_id   — מזהה תיקיית הדרייב של הקטגוריה
 *  materials.drive_original_name — השם שהיה לקובץ בדרייב לפני הארגון מחדש (התגית "שם ישן")
 * הרצה: npx tsx scripts/_add-drive-columns.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db } from "../src/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS drive_folder_id varchar(80)`);
  await db.execute(sql`ALTER TABLE materials ADD COLUMN IF NOT EXISTS drive_original_name text`);
  console.log("OK");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
