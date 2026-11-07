/**
 * חד-פעמי: יוצר את שתי טבלאות השיתוף-ברסיסים של סרטונים מלווים (ר' src/lib/drive-share-core.ts):
 *   video_share_shards – לכל חומר-סרטון: אילו קבצי דרייב (מקורי + עותקים) משמשים לשיתוף וכמה מורות על כל אחד
 *   video_shares       – על איזה רסיס שותף הסרטון עם כל מורה (unique לכל חומר+מורה)
 * `db:push` שבור בסביבה הזו, לכן SQL גולמי; IF NOT EXISTS – בטוח להריץ שוב. **חייב לרוץ ב-Neon לפני ה-push של הקוד
 * שקורא את הטבלאות** (push מפרס מיד; בלי הטבלאות "שליחה למייל" של סרטון חוזרת לקישור לאתר — לא נופלת, אבל בלי שיתוף בדרייב).
 *
 * ברירת המחדל dry-run (מדפיס את ה-SQL ואת ה-host): `npx tsx scripts/create-video-share-tables.ts`
 * הרצה אמיתית: `npx tsx scripts/create-video-share-tables.ts --apply`
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

export const VIDEO_SHARE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS video_share_shards (
    id serial PRIMARY KEY,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    file_id text NOT NULL UNIQUE,
    share_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS video_share_shards_material_idx ON video_share_shards (material_id)",
  `CREATE TABLE IF NOT EXISTS video_shares (
    id serial PRIMARY KEY,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email text NOT NULL,
    shard_id integer NOT NULL REFERENCES video_share_shards(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS video_shares_material_user_idx ON video_shares (material_id, user_id)",
  "CREATE INDEX IF NOT EXISTS video_shares_shard_idx ON video_shares (shard_id)",
];

async function main() {
  const url = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "");
  if (!url) throw new Error("DATABASE_URL חסר");
  const host = new URL(url).host;
  const apply = process.argv.includes("--apply");
  console.log(`DB host: ${host}`);
  console.log(apply ? "מצב: APPLY – מריץ את ה-SQL" : "מצב: dry-run – רק מדפיס (הוסיפי --apply להרצה)");
  for (const s of VIDEO_SHARE_TABLES_SQL) console.log(s + ";");
  if (!apply) return;
  const sql = neon(url);
  for (const s of VIDEO_SHARE_TABLES_SQL) await sql.query(s);
  console.log("הושלם: video_share_shards ו-video_shares קיימות");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
