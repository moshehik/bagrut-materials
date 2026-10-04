/**
 * מפרסם תגובה בתור "תמיכה" (הסוכן האוטומטי) בשרשור של דיווח קיים.
 * הרצה: npx tsx scripts/error-report-reply.ts <reportId> "<טקסט>" [--status=ARCHIVED] [--question] [--preview-url=<url>]
 *   --status=ARCHIVED : לסמן רק כשהתיקון אומת בפועל. בלי זה הדיווח נשאר OPEN.
 *   --question        : חובה כשהתגובה היא שאלה פתוחה שממתינה לתשובת המדווח/ת.
 *   --preview-url=... : מוסיף קישור Preview Deployment זמני לתגובה (רק בסוף סבב, ר' fix-reports.md).
 * דורש DATABASE_URL. ר' .claude/commands/fix-reports.md.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { addReportNote, setReportStatus } from "../src/lib/errorReports";

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [id, text] = positional;
  if (!id || !text) {
    console.error('שימוש: error-report-reply.ts <reportId> "<טקסט>" [--status=ARCHIVED] [--question] [--preview-url=<url>]');
    process.exit(1);
  }

  const statusArg = args.find((a) => a.startsWith("--status="))?.split("=")[1];
  const isQuestion = args.includes("--question");
  const previewUrl = args.find((a) => a.startsWith("--preview-url="))?.split("=")[1];

  const report = await addReportNote(id, text, {
    role: "support",
    isQuestion,
    authorKind: "agent",
    ...(previewUrl ? { previewUrl } : {}),
  });
  if (!report) {
    console.error(`FAILED: לא נמצא דיווח עם id=${id}`);
    process.exit(1);
  }

  if (statusArg === "ARCHIVED") {
    await setReportStatus(id, "ARCHIVED");
  }

  console.log(`OK: תגובה נוספה לדיווח ${id}${statusArg === "ARCHIVED" ? " (סומן ARCHIVED)" : ""}`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
