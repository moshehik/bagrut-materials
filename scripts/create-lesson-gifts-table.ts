/**
 * חד-פעמי: יוצר את טבלת lesson_gifts (יתרת "שיעורים במתנה" למורה). SQL גולמי כי db:push שבור כאן; IF NOT EXISTS – בטוח לשוב.
 * הקוד שקורא את הטבלה סובל את היעדרה (יתרה 0). dry-run כברירת מחדל; הרצה אמיתית: `--apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS lesson_gifts (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credits integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now()
)`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${new URL(url).host}\nמצב: ${apply ? "APPLY" : "dry-run"}\n${STATEMENTS.join(";\n")};`);
  if (!apply) return;
  const sql = neon(url);
  for (const s of STATEMENTS) await sql.query(s);
  console.log("הושלם: lesson_gifts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
