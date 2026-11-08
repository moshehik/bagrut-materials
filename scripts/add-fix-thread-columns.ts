/**
 * חד-פעמי: מוסיף לטבלת material_fixes את העמודות של שיחת ההערה הכללית עם הסוכן (עד 5 הודעות של המורה):
 *   parent_id  – מזהה ההערה הראשונה בשרשור (null בהערה הראשונה עצמה)
 *   turn       – מספר ההודעה של המורה בשרשור (1..5; null = 1)
 *   embedded_version_id – הגרסה הפרטית (material_private_versions.id) שבתוכה הסוכן שילב את התיקון המסומן של המורה;
 *                         כל עוד היא פעילה התיקון לא מוחל שוב בהגשה
 * + אינדקס על parent_id. `db:push` שבור בסביבה הזו, לכן SQL גולמי. IF NOT EXISTS – בטוח להריץ שוב.
 * חייב לרוץ ב-Neon לפני ה-push של הקוד שקורא את העמודות (drizzle בוחר עמודות במפורש, וחסרה אחת שוברת כל קריאה של material_fixes).
 *
 * dry-run כברירת מחדל: `npx tsx scripts/add-fix-thread-columns.ts`; הרצה אמיתית: `... --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS parent_id integer",
  "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS turn smallint",
  "ALTER TABLE material_fixes ADD COLUMN IF NOT EXISTS embedded_version_id integer",
  "CREATE INDEX IF NOT EXISTS material_fixes_parent_idx ON material_fixes (parent_id)",
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
  console.log("הושלם: material_fixes.parent_id + turn + embedded_version_id + אינדקס");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
