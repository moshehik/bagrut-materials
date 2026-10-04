/**
 * קורא/מכבה/מאפס-שעון-שקט את דגל ההפעלה של סוכן ה-fix-reports האוטומטי.
 * הרצה:
 *   npx tsx scripts/agent-loop-status.ts                 -> מדפיס "true" או "false" (הדגל דלוק?)
 *   npx tsx scripts/agent-loop-status.ts --disable        -> מכבה את הדגל
 *   npx tsx scripts/agent-loop-status.ts --enable         -> מדליק את הדגל (ומאפס שעון שקט)
 *   npx tsx scripts/agent-loop-status.ts --touch          -> מאפס את שעון השקט בלבד
 *   npx tsx scripts/agent-loop-status.ts --idle-minutes   -> מדפיס מספר: דקות מאז הפעילות האחרונה (-1 = אין תיעוד)
 *   npx tsx scripts/agent-loop-status.ts --should-run <event_name>
 *       -> מדפיס "true"/"false": האם ה-workflow צריך בכלל להפעיל את קלוד בהרצה הזו.
 *          false אם הדגל כבוי. אחרת: true תמיד אם event_name אינו "schedule" (כלומר
 *          repository_dispatch/workflow_dispatch - דיווח חדש שדורש "להעיר" את הסוכן
 *          מיד, גם אם היה שקט הרבה זמן). ל-"schedule" (טיק cron רגיל): true רק אם
 *          פחות מ-IDLE_SLEEP_MINUTES דקות שקט - כדי לא להפעיל את קלוד בחינם על כל
 *          טיק לנצח. חשוב: זה אף פעם לא מכבה את הדגל עצמו - ר' .claude/commands/
 *          fix-reports.md ("המתג נשאר דלוק").
 * ה-workflow (.github/workflows/claude-fix-reports.yml) קורא ל-`--should-run` כבדיקה
 * זולה לפני שהוא בכלל מפעיל את קלוד. ר' .claude/commands/fix-reports.md.
 * דורש DATABASE_URL (Postgres/Neon - ר' src/lib/agentLoopStatus.ts).
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { isLoopEnabled, setLoopEnabled, touchActivity, idleMinutes } from "../src/lib/agentLoopStatus";
import { logAgentEvent } from "../src/lib/agentEvents";

const IDLE_SLEEP_MINUTES = 20;

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--disable")) {
    await setLoopEnabled(false);
    await logAgentEvent({ source: "claude", kind: "toggle", summary: "הסוכן כובה (הוראת עצירה / CLI)" });
    console.log("false");
    return;
  }
  if (args.includes("--enable")) {
    await setLoopEnabled(true);
    await logAgentEvent({ source: "script", kind: "toggle", summary: "הסוכן הודלק (CLI)" });
    console.log("true");
    return;
  }
  if (args.includes("--touch")) {
    await touchActivity();
    await logAgentEvent({ source: "claude", kind: "touch", summary: "אופס שעון השקט (טופל דיווח)" });
    console.log("OK");
    return;
  }
  if (args.includes("--idle-minutes")) {
    console.log(String(await idleMinutes()));
    return;
  }
  if (args.includes("--should-run")) {
    const eventName = args[args.indexOf("--should-run") + 1];
    const enabled = await isLoopEnabled();
    const idle = await idleMinutes();
    const run = !enabled ? false : eventName !== "schedule" ? true : idle < 0 || idle < IDLE_SLEEP_MINUTES;
    const reason = !enabled
      ? "המתג כבוי"
      : eventName !== "schedule"
        ? `הופעל ע"י ${eventName} (מעיר את הסוכן)`
        : run
          ? "טיק cron, פעילות אחרונה לפני פחות מ-20 דק'"
          : `טיק cron בזמן שקט (${idle} דק')`;
    await logAgentEvent({
      source: "workflow",
      kind: run ? "run.start" : "run.skip",
      summary: `${run ? "ההרצה אושרה" : "ההרצה דולגה"}: ${reason}`,
      details: { event: eventName, enabled, idleMinutes: idle, repo: process.env.GITHUB_REPOSITORY, runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined },
    });
    console.log(String(run));
    return;
  }

  console.log(String(await isLoopEnabled()));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
