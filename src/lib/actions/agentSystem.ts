"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { listReports, createReport, addReportNote, setReportStatus } from "@/lib/errorReports";
import { isLoopEnabled, setLoopEnabled, idleMinutes } from "@/lib/agentLoopStatus";
import { driveListFiles, scoreDriveFilesByQuery, isDriveConfigured } from "@/lib/driveBridgeCore";
import { logAudit } from "@/lib/audit";
import { logAgentEvent } from "@/lib/agentEvents";
import { dispatchFixReportsAgent } from "@/lib/agentDispatch";

/**
 * פעולות אדמין-בלבד ללוח הבדיקה של מערכת הסוכן האוטומטי ב-/agent-system.
 * כל הפעולות דורשות requireAdmin (זורק אם לא אדמין) — זו הרשת האמיתית, לא
 * ההסתרה ב-UI. אף פעולה כאן לא מחזירה תוכן/בייטים של קובץ מהדרייב, רק מטא-דאטה.
 */

export async function getAgentSystemStatus() {
  await requireAdmin();
  const [loopEnabled, idle, reports] = await Promise.all([isLoopEnabled(), idleMinutes(), listReports()]);
  return { loopEnabled, idle, reports };
}

export async function setLoopEnabledAction(enabled: boolean) {
  const me = await requireAdmin();
  const before = await isLoopEnabled();
  await setLoopEnabled(enabled);
  await logAudit({ actorId: me.id, action: "agent.loop_toggle", entityType: "agent", details: { from: before, to: enabled } });
  await logAgentEvent({
    source: "admin",
    kind: "toggle",
    summary: enabled ? "הסוכן הודלק מהניהול" : "הסוכן כובה מהניהול",
    details: { from: before, to: enabled, by: me.email },
    actorId: me.id,
    runId: "admin",
  });
  revalidatePath("/agent-system");
  revalidatePath("/admin/agent");
  revalidatePath("/admin");
  return { enabled };
}

/** הפעלה מיידית של ה-workflow ב-GitHub (repository_dispatch) — בלי לחכות ל-cron. לא משנה את המתג. */
export async function runAgentNowAction(): Promise<{ sent: boolean; loopEnabled: boolean }> {
  const me = await requireAdmin();
  const loopEnabled = await isLoopEnabled();
  const sent = await dispatchFixReportsAgent();
  await logAudit({ actorId: me.id, action: "agent.run_now", entityType: "agent", details: { sent, loopEnabled } });
  await logAgentEvent({
    source: "admin",
    kind: "dispatch",
    summary: sent
      ? loopEnabled
        ? "הופעלה הרצה מיידית מהניהול"
        : "נשלחה הפעלה מיידית, אבל המתג כבוי — ה-workflow ידלג"
      : "הפעלה מיידית לא נשלחה (GH_DISPATCH_TOKEN חסר או שהקריאה נכשלה)",
    details: { sent, loopEnabled },
    actorId: me.id,
    runId: "admin",
  });
  revalidatePath("/admin/agent");
  return { sent, loopEnabled };
}

/** יוצרת דיווח-בדיקה ידני (למשל: "עשי ניסויים" מהלוח) — מסומן בבירור ככזה בכותרת. */
export async function createTestReportAction(text: string) {
  const me = await requireAdmin();
  const clean = String(text || "").trim().slice(0, 2000);
  if (!clean) throw new Error("טקסט ריק");
  const report = await createReport({
    userText: clean,
    title: "בדיקה ידנית מהמנהלת",
    url: "/agent-system",
  });
  await logAudit({ actorId: me.id, action: "agent.test_report", entityType: "agent", details: { reportId: report.id } });
  revalidatePath("/agent-system");
  revalidatePath("/admin/agent");
  return report;
}

export async function replyToReportAction(
  id: string,
  text: string,
  opts?: { archive?: boolean }
) {
  const me = await requireAdmin();
  const clean = String(text || "").trim().slice(0, 2000);
  if (!clean) throw new Error("טקסט ריק");
  await addReportNote(id, clean, { role: "support", authorKind: "admin" });
  if (opts?.archive) await setReportStatus(id, "ARCHIVED");
  await logAudit({ actorId: me.id, action: "agent.reply", entityType: "error_report", details: { reportId: id, archived: !!opts?.archive } });
  revalidatePath("/agent-system");
  revalidatePath("/admin/agent");
}

export type DriveSearchResult = Awaited<ReturnType<typeof driveListFiles>>[number] & { score: number };

/** מזהה קבצים מתאימים בארכיון הדרייב לפי תיאור חופשי. מטא-דאטה בלבד — לעולם לא תוכן/בייטים. */
export async function searchDriveFilesAction(query: string): Promise<{ configured: boolean; results: DriveSearchResult[] }> {
  const me = await requireAdmin();
  if (!isDriveConfigured()) return { configured: false, results: [] };
  const files = await driveListFiles();
  const q = String(query || "").trim();
  await logAudit({ actorId: me.id, action: "agent.drive_search", entityType: "agent", details: { query: q.slice(0, 120) } });
  const ranked = q ? scoreDriveFilesByQuery(files, q) : files.map((f) => ({ ...f, score: 0 }));
  return { configured: true, results: ranked.slice(0, 15) };
}
