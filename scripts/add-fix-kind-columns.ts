/**
 * חד-פעמי: מוסיף ל-material_fixes את העמודות kind / reason / user_note (תיקון שג'מיני ניסח לפי סיבה מרשימה
 * או תיאור חופשי של המורה, ותלונה כללית בלי טקסט מסומן). `db:push` שבור בסביבה הזו, לכן SQL גולמי.
 * IF NOT EXISTS – בטוח להריץ שוב. חייב לרוץ ב-Neon לפני ה-push של הקוד שקורא את העמודות (push מפרס מיד).
 *
 * ברירת המחדל dry-run: `npx tsx scripts/add-fix-kind-columns.ts`
 * הרצה אמיתית: `npx tsx scripts/add-fix-kind-columns.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS kind varchar(12) NOT NULL DEFAULT 'free'",
  "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS reason varchar(24)",
  "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS user_note text",
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
  console.log("הושלם: material_fixes.kind / reason / user_note קיימים");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
