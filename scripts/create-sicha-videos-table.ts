/**
 * חד-פעמי: יוצר את sicha_videos (סרטונים לשיעורים), sicha_files (קבצים נוספים לשיחה) ומוסיף את sichot.display_name + ערך sichot_videos לטיפוס category_module.
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי. IF NOT EXISTS – בטוח להריץ שוב. חייב לרוץ ב-Neon לפני ה-push של הקוד
 * שקורא אותם (push מפרס מיד). מניח שהטיפוס status_enum הקיים (אותו אחד של sichot).
 *
 * dry-run (ברירת מחדל): `npx tsx scripts/create-sicha-videos-table.ts`
 * הרצה אמיתית: `npx tsx scripts/create-sicha-videos-table.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const sql = neon(url);
  const apply = process.argv.includes("--apply");

  // שם טיפוס ה-status האמיתי כפי שהוא ב-sichot (לא מנחשים)
  const [col] = (await sql.query(
    `SELECT udt_name FROM information_schema.columns WHERE table_name = 'sichot' AND column_name = 'status'`,
  )) as { udt_name: string }[];
  if (!col) throw new Error("sichot.status לא נמצא – לא ממשיכה");
  const statusType = col.udt_name;
  if (!/^[a-z_]+$/.test(statusType)) throw new Error("שם טיפוס לא צפוי: " + statusType);

  const statements = [
    "ALTER TYPE category_module ADD VALUE IF NOT EXISTS 'sichot_videos'",
    "ALTER TABLE sichot ADD COLUMN IF NOT EXISTS display_name varchar(60)",
    `CREATE TABLE IF NOT EXISTS sicha_videos (
      id serial PRIMARY KEY,
      category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(200) NOT NULL,
      description text,
      drive_id varchar(100) NOT NULL,
      source_drive_id varchar(100),
      link_kind varchar(10) NOT NULL DEFAULT 'file',
      display_name varchar(60),
      status ${statusType} NOT NULL DEFAULT 'active',
      created_at timestamp NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS sicha_files (
      id serial PRIMARY KEY,
      sicha_id integer NOT NULL REFERENCES sichot(id) ON DELETE CASCADE,
      file_url text NOT NULL,
      file_name varchar(255) NOT NULL,
      mime varchar(120) NOT NULL,
      size integer NOT NULL DEFAULT 0,
      sort integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS sicha_files_sicha_idx ON sicha_files (sicha_id)",
    "CREATE INDEX IF NOT EXISTS sicha_videos_category_idx ON sicha_videos (category_id)",
    "CREATE INDEX IF NOT EXISTS sicha_videos_teacher_idx ON sicha_videos (teacher_id)",
    `CREATE TABLE IF NOT EXISTS sicha_video_links (
      id serial PRIMARY KEY,
      video_id integer NOT NULL REFERENCES sicha_videos(id) ON DELETE CASCADE,
      sicha_id integer NOT NULL REFERENCES sichot(id) ON DELETE CASCADE
    )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS sicha_video_links_uq ON sicha_video_links (video_id, sicha_id)",
    "CREATE INDEX IF NOT EXISTS sicha_video_links_sicha_idx ON sicha_video_links (sicha_id)",
  ];

  console.log(`DB host: ${new URL(url).host}`);
  console.log(`מצב: ${apply ? "APPLY" : "dry-run – רק מדפיס (הוסיפי --apply להרצה)"}`);
  for (const s of statements) console.log(s + ";\n");
  if (!apply) return;
  for (const s of statements) await sql.query(s);
  console.log("הושלם: sicha_videos + sichot.display_name קיימים");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
