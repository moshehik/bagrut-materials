/**
 * חד-פעמי: טבלת drive_events — היסטוריית שמות/העברות/הוספות של קבצים ותיקיות בדרייב
 * (מזינה את "קובץ המידע" _מידע.txt ואת חלון ההיסטוריה בסייר). SQL גולמי, IF NOT EXISTS.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db } from "../src/db";
import { sql } from "drizzle-orm";
(async () => {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS drive_events (
    id serial PRIMARY KEY,
    kind varchar(30) NOT NULL,
    material_id integer,
    category_id integer,
    drive_id varchar(80),
    old_value text,
    new_value text,
    details text,
    actor_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS drive_events_material_idx ON drive_events (material_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS drive_events_category_idx ON drive_events (category_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS drive_events_created_idx ON drive_events (created_at)`);
  console.log("OK");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
