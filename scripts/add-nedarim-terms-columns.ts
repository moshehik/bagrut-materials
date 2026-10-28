/**
 * חד-פעמי: מוסיף ל-nedarim_payments את עמודות תנאי התשלום (מספר תשלומים / הוראת קבע):
 *   charge_mode    – normal (עסקה רגילה ב-installments תשלומים) | keva (הוראת קבע אשראי, בלי תפיסת מסגרת). ברירת מחדל normal
 *   installments   – מספר התשלומים / החיובים החודשיים. ברירת מחדל 1 (כך נראו כל הבקשות עד היום)
 *   charge_amount  – הסכום הצפוי ב-Amount של העסקה בהיסטוריית נדרים (null = amount; בהוראת קבע = החיוב החודשי)
 *   keva_id        – מזהה הוראת הקבע אצל נדרים (נרשם כשחיוב ראשון הותאם)
 * הוספה בלבד, עם ברירות מחדל – שורות קיימות והקוד הפרוס כיום ממשיכים לעבוד כרגיל. `db:push` שבור בסביבה הזו, לכן SQL גולמי;
 * IF NOT EXISTS – בטוח להריץ שוב. **חייב לרוץ ב-Neon לפני ה-push של הקוד שקורא את העמודות** (drizzle בוחר את כל העמודות –
 * בלעדיהן כל SELECT מ-nedarim_payments ייכשל).
 *
 * ברירת המחדל dry-run (מדפיס את ה-SQL ואת ה-host): `npx tsx scripts/add-nedarim-terms-columns.ts`
 * הרצה אמיתית: `npx tsx scripts/add-nedarim-terms-columns.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

export const NEDARIM_TERMS_COLUMNS_SQL = [
  "ALTER TABLE nedarim_payments ADD COLUMN IF NOT EXISTS charge_mode varchar(8) NOT NULL DEFAULT 'normal'",
  "ALTER TABLE nedarim_payments ADD COLUMN IF NOT EXISTS installments integer NOT NULL DEFAULT 1",
  "ALTER TABLE nedarim_payments ADD COLUMN IF NOT EXISTS charge_amount integer",
  "ALTER TABLE nedarim_payments ADD COLUMN IF NOT EXISTS keva_id varchar(40)",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const host = new URL(url).host;
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${host}`);
  console.log(apply ? "מצב: APPLY – מריץ את ה-SQL" : "מצב: dry-run – רק מדפיס (הוסיפי --apply להרצה)");
  for (const s of NEDARIM_TERMS_COLUMNS_SQL) console.log(s + ";");
  if (!apply) return;
  const sql = neon(url);
  for (const s of NEDARIM_TERMS_COLUMNS_SQL) await sql.query(s);
  console.log("הושלם: nedarim_payments.charge_mode / installments / charge_amount / keva_id קיימים");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
