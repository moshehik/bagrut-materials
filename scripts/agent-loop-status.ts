/**
 * קורא/מכבה/מאפס-שעון-שקט את דגל ההפעלה של סוכן ה-fix-reports האוטומטי.
 * הרצה:
 *   npx tsx scripts/agent-loop-status.ts                 -> מדפיס "true" או "false" (הדגל דלוק?)
 *   npx tsx scripts/agent-loop-status.ts --disable        -> מכבה את הדגל
 *   npx tsx scripts/agent-loop-status.ts --enable         -> מדליק את הדגל (ומאפס שעון שקט)
 *   npx tsx scripts/agent-loop-status.ts --touch          -> מאפס את שעון השקט בלבד
 *   npx tsx scripts/agent-loop-status.ts --idle-minutes   -> מדפיס מספר: דקות מאז הפעילות האחרונה (-1 = אין תיעוד)
 * ה-workflow (.github/workflows/claude-fix-reports.yml) קורא לזה בלי דגלים, כבדיקה
 * זולה לפני שהוא בכלל מפעיל את קלוד. ר' .claude/commands/fix-reports.md.
 * דורש BLOB_READ_WRITE_TOKEN.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { isLoopEnabled, setLoopEnabled, touchActivity, idleMinutes } from "../src/lib/agentLoopStatus";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--disable")) {
    await setLoopEnabled(false);
    console.log("false");
    return;
  }
  if (args.includes("--enable")) {
    await setLoopEnabled(true);
    console.log("true");
    return;
  }
  if (args.includes("--touch")) {
    await touchActivity();
    console.log("OK");
    return;
  }
  if (args.includes("--idle-minutes")) {
    console.log(String(await idleMinutes()));
    return;
  }

  console.log(String(await isLoopEnabled()));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
