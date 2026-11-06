/**
 * חד-פעמי: טבלת material_private_versions (גרסה פרטית מתוקנת של חומר למורה אחת, בעקבות תלונה כללית)
 * + העמודות material_fixes.reply_text (מה שהמורה רואה אחרי שהסוכן טיפל בתלונה הכללית שלה) ו-material_fixes.artifacts
 * (JSON – מזהי הדרייב של קבצי העבודה שנשמרו להערה: original / edited / rendered / published).
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי. IF NOT EXISTS – בטוח להריץ שוב.
 * חייב לרוץ ב-Neon לפני ה-push של הקוד שקורא את הטבלה/העמודה (push מפרס מיד).
 *
 * ברירת המחדל dry-run (מדפיס את ה-SQL ואת ה-host): `npx tsx scripts/create-private-versions-table.ts`
 * הרצה אמיתית: `npx tsx scripts/create-private-versions-table.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS reply_text text",
  // JSON: קבצי העבודה שנשמרו בדרייב להערה (original/edited/rendered/published – מזהה, שם, זמן). לא מוחקים כלום.
  "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS artifacts text",
  `CREATE TABLE IF NOT EXISTS material_private_versions (
    id serial PRIMARY KEY,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fix_id integer REFERENCES material_fixes(id) ON DELETE SET NULL,
    file_url text NOT NULL,
    file_name varchar(255) NOT NULL,
    size integer NOT NULL DEFAULT 0,
    note text,
    status varchar(12) NOT NULL DEFAULT 'active',
    created_at timestamp NOT NULL DEFAULT now(),
    removed_at timestamp
  )`,
  "CREATE INDEX IF NOT EXISTS material_private_versions_user_idx ON material_private_versions (user_id, material_id)",
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
  console.log("הושלם: material_private_versions + material_fixes.reply_text / artifacts קיימים");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
