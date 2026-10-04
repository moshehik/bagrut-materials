/**
 * מדפיס (JSON ל-stdout) את דיווחי התקלות/שאלות הפתוחים, כולל שרשור "יומן הסוכן".
 * הרצה: npx tsx scripts/read-error-reports.ts [ALL]
 *   ברירת מחדל: רק status=OPEN. ALL = כולל ARCHIVED.
 * דורש DATABASE_URL (ב-.env.local מקומית, או secret באותו שם ב-GitHub Actions).
 * ר' .claude/commands/fix-reports.md לפרוטוקול המלא של השימוש בפלט הזה.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { listReports } from "../src/lib/errorReports";

async function main() {
  const all = process.argv.includes("ALL");
  const reports = await listReports();
  const filtered = all ? reports : reports.filter((r) => r.status === "OPEN" || r.kind === "agentLog");
  console.log(JSON.stringify(filtered, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
