/**
 * הלוגיקה הטהורה של תור הפקת המצגות (פורט של tickBody_ מ-_tools/pres/gas/NotebookQueue.gs). בלי DB ובלי רשת – נבדקת ב-
 * scripts/deck-queue-logic.test.ts. כל ההחלטות (מה עושים עם job לפי הסטטוס שהשרת מחזיר) כאן, ו-tick.ts רק מבצע.
 */
export const DEFAULT_MAX_CONCURRENT = 5; // הפקות במקביל; המכסה של הנוטבוק (~5 מצגות בשעה ב-3 חשבונות) היא הגבול האמיתי
export const MAX_TRIES = 3; // ניסיונות לכל job בכשל לא-מכסה
export const MAX_DOWNLOAD_TRIES = 6; // כשל בהורדה/העלאה מפסיד הפקה של ~30 דק' ומכסה – מנסים יותר, בלי להתחיל מחברת חדשה
export const RATE_WAIT_MIN = 15; // המתנה אחרי שגיאת מכסה
export const ERROR_WAIT_MIN = 5; // המתנה אחרי כשל אחר
export const JOB_TIMEOUT_MIN = 60; // job שרץ יותר משעה נכשל
export const MAX_POLL_ERRORS = 10; // כשלי polling רצופים (רשת/שרת) לפני שמוותרים על ה-job; פחות מזה = ממשיכים לנסות בלי לגעת במחברת

export type Stage = "new" | "src" | "gen" | "dl" | "wait" | "done" | "failed";
export const RUNNING_STAGES: Stage[] = ["src", "gen", "dl"];
export const isRunning = (s: string): boolean => (RUNNING_STAGES as string[]).includes(s);

export type OracleStatus = { st: string; rate: boolean; resultTaskId: string | null; raw: string };

/** הופך את תשובת /api/jobs/<id> של שרת הנוטבוק לסטטוס מנורמל */
export function parseOracleJob(j: unknown): OracleStatus {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  const result = (o.result && typeof o.result === "object" ? o.result : {}) as Record<string, unknown>;
  const taskId = typeof result.task_id === "string" && result.task_id ? result.task_id : null;
  let raw = "";
  try {
    raw = JSON.stringify(j) ?? "";
  } catch {}
  return { st: String(o.status ?? "").toLowerCase(), rate: /RateLimit/i.test(raw), resultTaskId: taskId, raw };
}

/** elapsedMs = כמה זמן עבר מ-started_at (מחושב ב-SQL, בלי תלות באזור זמן) */
export type JobView = { stage: Stage; tries: number; elapsedMs: number | null };

export type Decision =
  | { kind: "keep" } // עדיין רץ
  | { kind: "startGenerate" } // src הסתיים → מתחילים יצירת מצגת
  | { kind: "startDownload"; artifactId: string } // gen הסתיים → מתחילים הורדה
  | { kind: "finishDownload" } // dl הסתיים → מורידים את ה-PDF ושומרים
  | { kind: "waitRate"; minutes: number } // מכסה: מוחקים מחברת וממתינים
  | { kind: "retry"; minutes: number; tries: number } // כשל רגיל: ממתינים (ב-dl: ממשיכים מאותו שלב)
  | { kind: "fail"; reason: string };

/** מכריע מה לעשות ב-job שרץ (src/gen/dl) לפי הסטטוס שהשרת החזיר */
export function decideRunning(job: JobView, o: OracleStatus): Decision {
  if (o.st === "done") {
    if (job.stage === "src") return { kind: "startGenerate" };
    if (job.stage === "gen") return o.resultTaskId ? { kind: "startDownload", artifactId: o.resultTaskId } : decideOnException(job, "אין artifact בתוצאת היצירה");
    return { kind: "finishDownload" };
  }
  if (o.st === "error" || o.st === "failed") {
    if (job.stage === "dl") return decideOnException(job, `הורדה נכשלה בשרת הנוטבוק: ${o.raw.slice(0, 200)}`); // המצגת כבר קיימת – שולחים בקשת הורדה חדשה במקום ליצור מחדש
    if (o.rate) return { kind: "waitRate", minutes: RATE_WAIT_MIN };
    const tries = job.tries + 1;
    if (tries >= MAX_TRIES) return { kind: "fail", reason: o.raw.slice(0, 300) || "הנוטבוק דיווח כשל" };
    return { kind: "retry", minutes: ERROR_WAIT_MIN, tries };
  }
  if (job.elapsedMs !== null && job.elapsedMs > JOB_TIMEOUT_MIN * 60_000) return { kind: "fail", reason: `חריגת זמן (${JOB_TIMEOUT_MIN} דקות)` };
  return { kind: "keep" };
}

/** שגיאה בשליפת סטטוס בלבד (GET): לא הורסים הפקה רצה בגלל תקלת רשת רגעית */
export function decideOnPollError(job: JobView, pollErrors: number, message: string): Decision {
  if (pollErrors + 1 < MAX_POLL_ERRORS) return { kind: "keep" };
  return decideOnException(job, `שליפת סטטוס נכשלה ${pollErrors + 1} פעמים ברצף: ${message}`);
}

/** כשל חריג (חריגה בקוד/רשת) בשלב כלשהו */
export function decideOnException(job: JobView, message: string): Decision {
  const tries = job.tries + 1;
  if (job.stage === "dl") {
    return tries >= MAX_DOWNLOAD_TRIES ? { kind: "fail", reason: `הורדה/שמירה נכשלה ${tries} פעמים: ${message}`.slice(0, 400) } : { kind: "retry", minutes: 1, tries };
  }
  return tries >= MAX_TRIES ? { kind: "fail", reason: message.slice(0, 400) } : { kind: "retry", minutes: ERROR_WAIT_MIN, tries };
}

/** כמה jobs חדשים אפשר להתחיל: רק הפקות שרצות באמת נספרות (job שחזר מהמתנה לא חוסם את עצמו), ושום דבר כשכל החשבונות מוצו */
export function slotsToStart(activeRunning: number, maxConcurrent: number, allExhausted: boolean): number {
  if (allExhausted) return 0;
  return Math.max(0, maxConcurrent - activeRunning);
}

/** מזהה תקין ל-job (נשמר גם כשם קובץ) */
export const isValidJobId = (id: string): boolean => /^[A-Za-z0-9_.-]{3,100}$/.test(id);
