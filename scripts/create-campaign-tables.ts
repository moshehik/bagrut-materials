/**
 * חד-פעמי: יוצר את טבלאות קמפיין ההנחה המוגבל במקומות (campaigns, campaign_seats) ואת הקמפיין הראשון
 * "first10" – 50% הנחה על המנוי השנתי ל-10 הנרשמות הראשונות. IF NOT EXISTS / ON CONFLICT DO NOTHING – בטוח להריץ שוב.
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי. **חייב לרוץ ב-Neon לפני ה-push של הקוד שקורא את הטבלאות.**
 *
 * dry-run (ברירת מחדל): `npx tsx scripts/create-campaign-tables.ts`
 * הרצה אמיתית:           `npx tsx scripts/create-campaign-tables.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const FIRST_SLUG = "first10";
const FIRST_SEATS = 10;

export const CAMPAIGN_SQL = [
  `CREATE TABLE IF NOT EXISTS campaigns (
    slug varchar(40) PRIMARY KEY,
    title varchar(120) NOT NULL,
    percent integer NOT NULL,
    plan varchar(20) NOT NULL DEFAULT 'yearly',
    total_seats integer NOT NULL,
    active boolean NOT NULL DEFAULT true,
    ends_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS campaign_seats (
    id serial PRIMARY KEY,
    campaign_slug varchar(40) NOT NULL REFERENCES campaigns(slug) ON DELETE CASCADE,
    slot integer NOT NULL,
    status varchar(10) NOT NULL DEFAULT 'free',
    user_id integer REFERENCES users(id) ON DELETE SET NULL,
    payment_id integer REFERENCES nedarim_payments(id) ON DELETE SET NULL,
    reserved_until timestamp,
    claimed_at timestamp
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS campaign_seats_slot_idx ON campaign_seats (campaign_slug, slot)",
  "CREATE UNIQUE INDEX IF NOT EXISTS campaign_seats_user_idx ON campaign_seats (campaign_slug, user_id) WHERE user_id IS NOT NULL",
  `INSERT INTO campaigns (slug, title, percent, plan, total_seats) VALUES ('${FIRST_SLUG}', '50% הנחה למנוי השנתי – 10 הנרשמות הראשונות', 50, 'yearly', ${FIRST_SEATS}) ON CONFLICT (slug) DO NOTHING`,
  `INSERT INTO campaign_seats (campaign_slug, slot) SELECT '${FIRST_SLUG}', g FROM generate_series(1, ${FIRST_SEATS}) g ON CONFLICT (campaign_slug, slot) DO NOTHING`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${new URL(url).host}`);
  console.log(apply ? "מצב: APPLY – מריץ את ה-SQL" : "מצב: dry-run – רק מדפיס (הוסיפי --apply להרצה)");
  for (const s of CAMPAIGN_SQL) console.log(s + ";");
  if (!apply) return;
  const sql = neon(url);
  for (const s of CAMPAIGN_SQL) await sql.query(s);
  const r = await sql.query("SELECT count(*)::int AS n FROM campaign_seats WHERE campaign_slug = $1", [FIRST_SLUG]);
  console.log(`הושלם: campaigns + campaign_seats קיימות; מקומות ב-${FIRST_SLUG}: ${(r[0] as { n: number }).n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
