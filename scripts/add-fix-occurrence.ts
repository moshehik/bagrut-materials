/**
 * חד-פעמי: מוסיף את העמודה occurrence לטבלת material_fixes (איזה מופע של הטקסט המסומן המורה התכוונה אליו).
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי. IF NOT EXISTS – בטוח להריץ שוב. חייב לרוץ ב-Neon לפני ה-push של הקוד
 * שקורא את העמודה (push מפרס מיד).
 *
 * ברירת המחדל dry-run (מדפיס את ה-SQL ואת ה-host): `npx tsx scripts/add-fix-occurrence.ts`
 * הרצה אמיתית: `npx tsx scripts/add-fix-occurrence.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENT = "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS occurrence integer";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const host = new URL(url).host;
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${host}`);
  console.log(`מצב: ${apply ? "APPLY" : "dry-run – רק מדפיס (הוסיפי --apply להרצה)"}\n${STATEMENT};`);
  if (!apply) return;
  const sql = neon(url);
  await sql.query(STATEMENT);
  console.log("הושלם: material_fixes.occurrence קיים");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
