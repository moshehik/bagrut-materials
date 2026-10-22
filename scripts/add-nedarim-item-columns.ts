/**
 * חד-פעמי: מוסיף ל-nedarim_payments את עמודות רכישת הפריט (הורדה בודדת / קובץ מורחב דרך /pay):
 *   material_id       – החומר (plan = single)
 *   item_category_id  – התיקייה (plan = bundle; ב-single – התיקייה של החומר)
 *   item_title        – שם הפריט בזמן יצירת הבקשה
 * כולן nullable, בלי ברירת מחדל – שורות קיימות (מסלולי מנוי) והקוד הפרוס כיום ממשיכים לעבוד. `db:push` שבור בסביבה הזו,
 * לכן SQL גולמי; IF NOT EXISTS – בטוח להריץ שוב. **חייב לרוץ ב-Neon לפני ה-push של הקוד שקורא את העמודות** (push מפרס מיד;
 * drizzle בוחר את כל העמודות של הטבלה – בלעדיהן כל SELECT מ-nedarim_payments ייכשל). אותן פקודות נמצאות גם ב-
 * create-nedarim-tables.ts (להתקנה מאפס).
 *
 * ברירת המחדל dry-run (מדפיס את ה-SQL ואת ה-host): `npx tsx scripts/add-nedarim-item-columns.ts`
 * הרצה אמיתית: `npx tsx scripts/add-nedarim-item-columns.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

export const NEDARIM_ITEM_COLUMNS_SQL = [
  "ALTER TABLE nedarim_payments ADD COLUMN IF NOT EXISTS material_id integer REFERENCES materials(id) ON DELETE SET NULL",
  "ALTER TABLE nedarim_payments ADD COLUMN IF NOT EXISTS item_category_id integer REFERENCES categories(id) ON DELETE SET NULL",
  "ALTER TABLE nedarim_payments ADD COLUMN IF NOT EXISTS item_title varchar(200)",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const host = new URL(url).host;
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${host}`);
  console.log(apply ? "מצב: APPLY – מריץ את ה-SQL" : "מצב: dry-run – רק מדפיס (הוסיפי --apply להרצה)");
  for (const s of NEDARIM_ITEM_COLUMNS_SQL) console.log(s + ";");
  if (!apply) return;
  const sql = neon(url);
  for (const s of NEDARIM_ITEM_COLUMNS_SQL) await sql.query(s);
  console.log("הושלם: nedarim_payments.material_id / item_category_id / item_title קיימים");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
