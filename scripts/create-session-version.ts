/**
 * חד-פעמי: מוסיף עמודות אבטחה ב-SQL גולמי — `npm run db:push` נכשל על הסביבה הזו
 * (ר' הערה ב-scripts/create-fix-tables.ts).
 *   users.session_version   – גרסת סשן; נכנסת ל-JWT ומנתקת סשנים ישנים בשינוי סיסמה/השהיה
 *   auth_tokens.target_email – הכתובת החדשה שטוקן change_email הונפק עבורה
 * IF NOT EXISTS – בטוח להריץ שוב. הרצה: npx tsx scripts/create-session-version.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1`,
  );
  await db.execute(sql`ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS target_email varchar(255)`);
  const [{ sv, te }] = (
    await db.execute(sql`SELECT
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'session_version') AS sv,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = 'auth_tokens' AND column_name = 'target_email') AS te`)
  ).rows as { sv: string | number; te: string | number }[];
  console.log(`users.session_version: ${Number(sv) ? "ready" : "MISSING"}; auth_tokens.target_email: ${Number(te) ? "ready" : "MISSING"}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
