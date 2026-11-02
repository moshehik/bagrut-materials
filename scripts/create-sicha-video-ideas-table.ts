/**
 * חד-פעמי: יוצר את sicha_video_ideas – רעיונות של מורות "למה הסרטון מתאים לשיעור" (בדף הסרטון עצמו).
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי. IF NOT EXISTS – בטוח להריץ שוב. חייב לרוץ ב-Neon לפני ה-push של הקוד
 * שקורא אותו (push מפרס מיד). טבלה חדשה וריקה – לא נוגעת בשום נתון קיים.
 *
 * dry-run (ברירת מחדל): `npx tsx scripts/create-sicha-video-ideas-table.ts`
 * הרצה אמיתית: `npx tsx scripts/create-sicha-video-ideas-table.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sicha_video_ideas (
    id serial PRIMARY KEY,
    video_id integer NOT NULL REFERENCES sicha_videos(id) ON DELETE CASCADE,
    teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS sicha_video_ideas_video_idx ON sicha_video_ideas (video_id)",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL חסר");
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${new URL(url).host}`);
  console.log(`מצב: ${apply ? "APPLY" : "dry-run – רק מדפיס (הוסיפי --apply להרצה)"}\n${STATEMENTS.join(";\n")};`);
  if (!apply) return;
  const sql = neon(url);
  for (const s of STATEMENTS) await sql.query(s);
  console.log("הושלם: sicha_video_ideas קיימת");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
