/**
 * חד-פעמי: מוסיף לטבלת downloads את העמודות dl_token (הטוקן ?dlt= של הדפדפן שהתחיל את ההורדה) ו-purchase_id (מנוי שהורדה
 * ניכתה ממנו), כדי שהורדה שנכשלה בצד הדפדפן (למשל נטפרי חסם את הקובץ אחרי שהשרת שלח אותו) תוחזר למכסה – ר' /api/download-failed.
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי. IF NOT EXISTS – בטוח להריץ שוב. חייב לרוץ ב-Neon לפני ה-push של הקוד שקורא את העמודות.
 *
 * dry-run כברירת מחדל: `npx tsx scripts/add-download-token-columns.ts`; הרצה אמיתית: `... --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  "ALTER TABLE downloads ADD COLUMN IF NOT EXISTS dl_token varchar(32)",
  "ALTER TABLE downloads ADD COLUMN IF NOT EXISTS purchase_id integer",
  "CREATE INDEX IF NOT EXISTS downloads_token_idx ON downloads (user_id, dl_token)",
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
  console.log("הושלם: downloads.dl_token + purchase_id + אינדקס");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
