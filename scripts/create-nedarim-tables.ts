/**
 * חד-פעמי: יוצר את טבלאות התשלום דרך נדרים פלוס (nedarim_payments, nedarim_payment_events) ב-SQL גולמי —
 * `npm run db:push` שבור בסביבה הזו (ר' scripts/create-fix-tables.ts). IF NOT EXISTS – בטוח להריץ שוב.
 *
 * ברירת המחדל היא dry-run: מדפיס את ה-SQL ואת ה-host של ה-DB ולא מריץ כלום.
 * הרצה אמיתית (על Neon, לפני ה-push שמפרס את הקוד – כלל קבוע ב-CLAUDE.md):
 *   npx tsx scripts/create-nedarim-tables.ts --apply
 * ר' docs/nedarim-payments.md.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { sql } from "drizzle-orm";

export const NEDARIM_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS nedarim_payments (
    id serial PRIMARY KEY,
    reference varchar(16) NOT NULL,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status varchar(12) NOT NULL DEFAULT 'pending',
    plan plan NOT NULL,
    category_ids text NOT NULL DEFAULT '[]',
    subjects_pending boolean NOT NULL DEFAULT false,
    amount integer NOT NULL,
    list_amount integer NOT NULL,
    coupon_id integer REFERENCES private_coupons(id) ON DELETE SET NULL,
    coupon_percent integer,
    first_name varchar(60),
    last_name varchar(60),
    phone varchar(20),
    email varchar(255),
    mosad_id varchar(20),
    transaction_id varchar(40),
    confirmation varchar(40),
    card_last4 varchar(4),
    verified boolean NOT NULL DEFAULT false,
    verify_method varchar(12),
    client_response text,
    callback_body text,
    error_message text,
    assist_requested_at timestamp,
    ip varchar(64),
    user_agent text,
    paid_at timestamp,
    purchase_id integer REFERENCES purchases(id) ON DELETE SET NULL,
    settled_by_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS nedarim_payments_reference_idx ON nedarim_payments (reference)`,
  `CREATE INDEX IF NOT EXISTS nedarim_payments_user_idx ON nedarim_payments (user_id)`,
  `CREATE INDEX IF NOT EXISTS nedarim_payments_status_idx ON nedarim_payments (status, created_at)`,
  `CREATE INDEX IF NOT EXISTS nedarim_payments_tx_idx ON nedarim_payments (transaction_id)`,
  `CREATE TABLE IF NOT EXISTS nedarim_payment_events (
    id serial PRIMARY KEY,
    payment_id integer NOT NULL REFERENCES nedarim_payments(id) ON DELETE CASCADE,
    kind varchar(30) NOT NULL,
    message text,
    detail text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS nedarim_payment_events_payment_idx ON nedarim_payment_events (payment_id, created_at)`,
];

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL ?? "";
  let host = "(DATABASE_URL לא מוגדר)";
  try {
    host = new URL(url).host;
  } catch {
    /* ריק */
  }
  console.log(`DB host: ${host}`);
  console.log(apply ? "מצב: APPLY – מריץ את ה-SQL" : "מצב: dry-run – רק מדפיס (הוסיפי --apply להרצה)");
  for (const s of NEDARIM_TABLES_SQL) console.log("\n" + s + ";");
  if (!apply) return;
  const { db } = await import("../src/db");
  for (const s of NEDARIM_TABLES_SQL) await db.execute(sql.raw(s));
  console.log("\nnedarim_payments + nedarim_payment_events ready");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
