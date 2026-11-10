/**
 * נותן למורה N "שיעורים במתנה" (מוסיף ליתרה הקיימת): npx tsx scripts/grant-gift-lessons.ts <email> <N> [--apply]
 * dry-run כברירת מחדל. הטבלה: scripts/create-lesson-gifts-table.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const [email, nStr] = process.argv.slice(2);
  const n = Number(nStr);
  if (!email || !Number.isInteger(n) || n < 1) throw new Error("שימוש: grant-gift-lessons.ts <email> <N> [--apply]");
  const apply = process.argv.includes("--apply");
  const sql = neon(process.env.DATABASE_URL!);
  const users = await sql.query("SELECT id, name, email FROM users WHERE lower(email) = lower($1)", [email]);
  if (!users.length) throw new Error("משתמשת לא נמצאה");
  const u = users[0] as { id: number; name: string; email: string };
  console.log(`${u.name} <${u.email}> #${u.id} – מוסיפים ${n} שיעורים במתנה (${apply ? "APPLY" : "dry-run"})`);
  if (!apply) return;
  const r = await sql.query(
    `INSERT INTO lesson_gifts (user_id, credits) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET credits = lesson_gifts.credits + $2, updated_at = now() RETURNING credits`,
    [u.id, n],
  );
  console.log("יתרה עכשיו:", (r[0] as { credits: number }).credits);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
