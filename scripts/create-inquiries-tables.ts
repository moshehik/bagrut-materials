/**
 * חד-פעמי: יוצר את טבלאות הפניות מ"צרי קשר" (contact_inquiries, contact_inquiry_messages) ב-SQL גולמי –
 * `npm run db:push` שבור בסביבה הזו (ר' create-fix-tables.ts).
 * ברירת מחדל = dry-run (רק מדפיס את ה-SQL). הרצה בפועל: npx tsx scripts/create-inquiries-tables.ts --apply
 * IF NOT EXISTS – בטוח להריץ שוב. חייב לרוץ ב-Neon לפני פריסה של הקוד.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS contact_inquiries (
    id serial PRIMARY KEY,
    name varchar(120) NOT NULL,
    email varchar(255) NOT NULL,
    topic varchar(120),
    status varchar(12) NOT NULL DEFAULT 'open',
    user_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    answered_at timestamp,
    answered_by integer REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS contact_inquiries_status_idx ON contact_inquiries (status)`,
  `CREATE INDEX IF NOT EXISTS contact_inquiries_created_idx ON contact_inquiries (created_at)`,
  `CREATE TABLE IF NOT EXISTS contact_inquiry_messages (
    id serial PRIMARY KEY,
    inquiry_id integer NOT NULL REFERENCES contact_inquiries(id) ON DELETE CASCADE,
    direction varchar(3) NOT NULL,
    subject varchar(300),
    body text NOT NULL,
    sent_ok boolean NOT NULL DEFAULT true,
    email_log_id integer,
    author_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS contact_inquiry_messages_inquiry_idx ON contact_inquiry_messages (inquiry_id, created_at)`,
];

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log("DRY-RUN (לא משנה כלום). להרצה בפועל: --apply\n");
    for (const s of STATEMENTS) console.log(s + ";\n");
    return;
  }
  const { db } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  for (const s of STATEMENTS) await db.execute(sql.raw(s));
  console.log("contact_inquiries + contact_inquiry_messages ready");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
