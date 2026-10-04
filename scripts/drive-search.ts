/**
 * מזהה איזה קובץ בארכיון הדרייב מתאים לתיאור חופשי (למשל מתוך דיווח/שאלה) —
 * מחזיר JSON של מטא-דאטה בלבד (שם/id/גודל/קישור), מדורג לפי דמיון-שם.
 * הרצה: npx tsx scripts/drive-search.ts "<תיאור חופשי, למשל: פרק ה יחזקאל שכפול>"
 * בלי ארגומנט: מדפיס את כל רשימת הקבצים בארכיון (לא מדורג).
 *
 * **לעולם לא** מחזיר/מדפיס תוכן של קובץ — רק מטא-דאטה, כדי לזהות קובץ. ר'
 * .claude/commands/fix-reports.md ו-"כללי עריכת קבצי וורד מבוקשים באתר.md":
 * אסור להעביר תוכן קובץ בפועל למדווח/ת (visitor) בתגובה בשרשור ציבורי.
 * דורש DRIVE_BRIDGE_URL / DRIVE_BRIDGE_SECRET (ר' src/lib/driveBridgeCore.ts).
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { driveListFiles, scoreDriveFilesByQuery, isDriveConfigured } from "../src/lib/driveBridgeCore";
import { logAgentEvent } from "../src/lib/agentEvents";

async function main() {
  if (!isDriveConfigured()) {
    console.error("FAILED: הדרייב לא מוגדר (DRIVE_BRIDGE_URL / DRIVE_BRIDGE_SECRET חסרים)");
    process.exit(1);
  }

  const query = process.argv.slice(2).join(" ").trim();
  const files = await driveListFiles();

  if (!query) {
    console.log(JSON.stringify(files, null, 2));
    return;
  }

  const ranked = scoreDriveFilesByQuery(files, query).slice(0, 15);
  await logAgentEvent({
    source: "claude",
    kind: "cli",
    summary: `drive-search "${query.slice(0, 120)}": ${ranked.length} תוצאות`,
    details: ranked.slice(0, 5).map((f) => ({ name: f.name, id: f.id, score: f.score })),
  });
  console.log(JSON.stringify(ranked, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
