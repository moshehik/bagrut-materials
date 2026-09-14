import { randomUUID } from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { errorReports as errorReportsTable, errorReportNotes as errorReportNotesTable } from "@/db/schema";
import { dispatchFixReportsAgent } from "@/lib/agentDispatch";

/**
 * דיווחי תקלות/שאלות מהאתר (מערכת "תמיכה ושגיאות") + שרשור-על ("יומן הסוכן").
 * מאוחסן ב-Postgres (Neon), לא ב-Blob — הועבר מ-Vercel Blob ל-DB ב-09.2026 אחרי
 * שה-Blob store של הפרויקט הושעה (מכסה). ר' /agent-system לתיעוד המלא, ו-
 * .claude/commands/fix-reports.md לפרוטוקול הסוכן שקורא/כותב לכאן.
 */

export type ErrorReportStatus = "OPEN" | "ARCHIVED";

export type ErrorReportNote = {
  id: string;
  text: string;
  createdAt: string;
  /** מי כתב את התגובה — "support" = הסוכן האוטומטי/מנהל, "reporter" = מי שפתח את הדיווח. */
  role: "support" | "reporter";
  /** true רק כשזו שאלה פתוחה שממתינה בפועל לתשובת המדווח/ת (ר' .claude/commands/fix-reports.md) */
  isQuestion: boolean;
  /** קישור ל-Preview Deployment זמני של תיקון (מתווסף רק בסוף סבב תיקונים) */
  previewUrl?: string;
  /** רק כש-role="support": מי כתב בפועל — "agent" (הסוכן האוטומטי) או "admin" (הוקלד ידנית ב-/agent-system).
   * פנימי בלבד — לא משפיע על התצוגה כלפי מדווח/ת (ר' .claude/commands/fix-reports.md לשימוש בלוגיקת הסיווג). */
  authorKind?: "agent" | "admin";
};

export type ErrorReport = {
  id: string;
  status: ErrorReportStatus;
  createdAt: string;
  updatedAt: string;
  time: string | null;
  url: string | null;
  title: string | null;
  queryParams: string | null;
  lastButtons: string[];
  userText: string;
  notes: ErrorReportNote[];
  /** "agentLog" מסמן את שרשור-העל הקבוע שבו הסוכן האוטומטי מדווח על עצמו (ר' getOrCreateAgentLog) */
  kind: "report" | "agentLog";
};

async function attachNotes(reports: (typeof errorReportsTable.$inferSelect)[]): Promise<ErrorReport[]> {
  const out: ErrorReport[] = [];
  for (const r of reports) {
    const notes = await db
      .select()
      .from(errorReportNotesTable)
      .where(eq(errorReportNotesTable.reportId, r.id))
      .orderBy(errorReportNotesTable.createdAt);
    out.push({
      id: r.id,
      status: r.status,
      kind: r.kind,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      time: r.time,
      url: r.url,
      title: r.title,
      queryParams: r.queryParams,
      lastButtons: r.lastButtons ? (JSON.parse(r.lastButtons) as string[]) : [],
      userText: r.userText,
      notes: notes.map((n) => ({
        id: n.id,
        text: n.text,
        createdAt: n.createdAt.toISOString(),
        role: n.role,
        isQuestion: n.isQuestion,
        ...(n.previewUrl ? { previewUrl: n.previewUrl } : {}),
        ...(n.authorKind ? { authorKind: n.authorKind } : {}),
      })),
    });
  }
  return out;
}

export async function listReports(): Promise<ErrorReport[]> {
  const rows = await db.select().from(errorReportsTable).orderBy(desc(errorReportsTable.updatedAt));
  return attachNotes(rows);
}

export type CreateReportInput = {
  userText: string;
  time?: string;
  url?: string;
  title?: string;
  queryParams?: string;
  lastButtons?: string[];
};

export async function createReport(input: CreateReportInput): Promise<ErrorReport> {
  const id = randomUUID();
  const [row] = await db
    .insert(errorReportsTable)
    .values({
      id,
      status: "OPEN",
      kind: "report",
      time: input.time ? String(input.time).slice(0, 100) : null,
      url: input.url ? String(input.url).slice(0, 500) : null,
      title: input.title ? String(input.title).slice(0, 200) : null,
      queryParams: input.queryParams ? String(input.queryParams).slice(0, 500) : null,
      lastButtons: JSON.stringify(
        Array.isArray(input.lastButtons) ? input.lastButtons.slice(0, 5).map((s) => String(s).slice(0, 80)) : []
      ),
      userText: input.userText,
    })
    .returning();

  void dispatchFixReportsAgent(); // לא ממתינים — אם זה נכשל/לא מוגדר, יצירת הדיווח לא נפגעת

  const [full] = await attachNotes([row]);
  return full;
}

export async function setReportStatus(id: string, status: ErrorReportStatus): Promise<ErrorReport | null> {
  const [row] = await db
    .update(errorReportsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(errorReportsTable.id, id))
    .returning();
  if (!row) return null;
  const [full] = await attachNotes([row]);
  return full;
}

export async function addReportNote(
  id: string,
  text: string,
  opts?: {
    role?: "support" | "reporter";
    isQuestion?: boolean;
    previewUrl?: string;
    /** רק רלוונטי כש-role="support" — ר' ErrorReportNote.authorKind. */
    authorKind?: "agent" | "admin";
  }
): Promise<ErrorReport | null> {
  const [report] = await db.select().from(errorReportsTable).where(eq(errorReportsTable.id, id));
  if (!report) return null;

  await db.insert(errorReportNotesTable).values({
    id: randomUUID(),
    reportId: id,
    text,
    role: opts?.role ?? "support",
    isQuestion: opts?.isQuestion ?? false,
    ...(opts?.previewUrl ? { previewUrl: opts.previewUrl } : {}),
    ...(opts?.authorKind ? { authorKind: opts.authorKind } : {}),
  });
  const [updated] = await db
    .update(errorReportsTable)
    .set({ updatedAt: new Date() })
    .where(eq(errorReportsTable.id, id))
    .returning();

  const [full] = await attachNotes([updated]);
  return full;
}

const AGENT_LOG_TITLE = "יומן הסוכן האוטומטי";

/** מוצא (או יוצר, בפעם הראשונה) את שרשור-העל הקבוע שבו הסוכן האוטומטי מדווח על עצמו — ר' .claude/commands/fix-reports.md */
export async function getOrCreateAgentLog(): Promise<ErrorReport> {
  const [existing] = await db.select().from(errorReportsTable).where(eq(errorReportsTable.kind, "agentLog"));
  if (existing) {
    const [full] = await attachNotes([existing]);
    return full;
  }

  const [row] = await db
    .insert(errorReportsTable)
    .values({
      id: randomUUID(),
      status: "OPEN",
      kind: "agentLog",
      title: AGENT_LOG_TITLE,
      lastButtons: JSON.stringify([]),
      userText:
        'שרשור-על קבוע: כאן הסוכן האוטומטי (fix-reports) מדווח על עבודתו ברמת-על, ואפשר לדבר איתו ישירות (למשל "תפסיק לרוץ").',
    })
    .returning();

  const [full] = await attachNotes([row]);
  return full;
}
