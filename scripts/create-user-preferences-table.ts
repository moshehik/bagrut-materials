/**
 * חד-פעמי: יוצר את טבלת user_preferences (הגדרות אישיות של מורה; כרגע fill_line_percent = יחס אורך קווי-המילוי).
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי. IF NOT EXISTS – בטוח להריץ שוב.
 * הקוד שקורא את הטבלה סובל את היעדרה (מחזיר ברירת מחדל), אבל שמירת הגדרה דורשת שהיא תהיה קיימת - להריץ לפני שחלונית ההגדרה עולה.
 *
 * dry-run כברירת מחדל: `npx tsx scripts/create-user-preferences-table.ts`; הרצה אמיתית: `... --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS user_preferences (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fill_line_percent integer NOT NULL DEFAULT 100,
  updated_at timestamp NOT NULL DEFAULT now()
)`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const host = new URL(url).host;
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${host}`);
  console.log(`מצב: ${apply ? "APPLY" : "dry-run – רק מדפיס (הוסיפי --apply להרצה)"}\n${STATEMENTS.join(";\n")};`);
  if (!apply) return;
  const sql = neon(url);
  for (const s of STATEMENTS) await sql.query(s);
  console.log("הושלם: user_preferences");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
