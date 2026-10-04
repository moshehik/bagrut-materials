/**
 * מוצא (או יוצר, בפעם הראשונה) את שרשור "יומן הסוכן האוטומטי" הקבוע, ומדפיס את ה-id שלו.
 * הרצה: npx tsx scripts/agent-log-report.ts
 * דורש DATABASE_URL. ר' .claude/commands/fix-reports.md.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getOrCreateAgentLog } from "../src/lib/errorReports";

async function main() {
  const log = await getOrCreateAgentLog();
  console.log(log.id);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
