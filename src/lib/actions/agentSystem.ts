"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { listReports, createReport, addReportNote, setReportStatus } from "@/lib/errorReports";
import { isLoopEnabled, setLoopEnabled, idleMinutes } from "@/lib/agentLoopStatus";
import { driveListFiles, scoreDriveFilesByQuery, isDriveConfigured } from "@/lib/driveBridgeCore";

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
  await requireAdmin();
  await setLoopEnabled(enabled);
  revalidatePath("/agent-system");
}

/** יוצרת דיווח-בדיקה ידני (למשל: "עשי ניסויים" מהלוח) — מסומן בבירור ככזה בכותרת. */
export async function createTestReportAction(text: string) {
  await requireAdmin();
  const clean = String(text || "").trim().slice(0, 2000);
  if (!clean) throw new Error("טקסט ריק");
  const report = await createReport({
    userText: clean,
    title: "בדיקה ידנית מהמנהלת",
    url: "/agent-system",
  });
  revalidatePath("/agent-system");
  return report;
}

export async function replyToReportAction(
  id: string,
  text: string,
  opts?: { archive?: boolean }
) {
  await requireAdmin();
  const clean = String(text || "").trim().slice(0, 2000);
  if (!clean) throw new Error("טקסט ריק");
  await addReportNote(id, clean, { role: "support" });
  if (opts?.archive) await setReportStatus(id, "ARCHIVED");
  revalidatePath("/agent-system");
}

export type DriveSearchResult = Awaited<ReturnType<typeof driveListFiles>>[number] & { score: number };

/** מזהה קבצים מתאימים בארכיון הדרייב לפי תיאור חופשי. מטא-דאטה בלבד — לעולם לא תוכן/בייטים. */
export async function searchDriveFilesAction(query: string): Promise<{ configured: boolean; results: DriveSearchResult[] }> {
  await requireAdmin();
  if (!isDriveConfigured()) return { configured: false, results: [] };
  const files = await driveListFiles();
  const q = String(query || "").trim();
  const ranked = q ? scoreDriveFilesByQuery(files, q) : files.map((f) => ({ ...f, score: 0 }));
  return { configured: true, results: ranked.slice(0, 15) };
}
