/**
 * רושם אירוע ביומן הסוכן (טבלת agent_events, מוצג ב-/admin/agent) — שימוש ע"י קלוד כדי
 * לתעד כל צעד משמעותי שאין לו כלי רושם משלו: החלטה, בדיקה, קומיט, פתיחת PR, שגיאה.
 * הרצה: npx tsx scripts/agent-log-event.ts <kind> "<תקציר>" [--details="<טקסט/JSON>"] [--report=<reportId>]
 *   kind מומלץ: decision | investigate | fix | commit | pr | error | note
 * סודות (connection strings, טוקנים) מוסתרים אוטומטית לפני הכתיבה (ר' redactSecrets).
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { logAgentEvent } from "../src/lib/agentEvents";

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [kind, summary] = positional;
  if (!kind || !summary) {
    console.error('שימוש: agent-log-event.ts <kind> "<תקציר>" [--details="..."] [--report=<id>]');
    process.exit(1);
  }
  const details = args.find((a) => a.startsWith("--details="))?.slice("--details=".length);
  const reportId = args.find((a) => a.startsWith("--report="))?.slice("--report=".length);
  await logAgentEvent({ source: "claude", kind, summary, details, reportId });
  console.log("OK");
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
