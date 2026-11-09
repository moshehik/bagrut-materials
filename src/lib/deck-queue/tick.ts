import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { deckJobs, deckQueueState } from "@/db/schema";
import { uploadRawImages } from "./drive";
import {
  allSlidesExhausted,
  deleteNotebook,
  oracleLogin,
  startDownload,
  startGenerate,
  startNotebook,
  type OracleClient,
} from "./oracle";
import { DEFAULT_MAX_CONCURRENT, decideOnException, decideOnPollError, decideRunning, isRunning, parseOracleJob, slotsToStart, type Decision, type Stage } from "./logic";

/**
 * ה-tick של תור הפקת המצגות: מחליף את tickBody_ של Apps Script. נקרא מכרון של Vercel (כל דקה, /api/cron/deck-queue) ומ-CLI.
 * הכרון של Vercel הוא "best effort" (ייתכנו הפעלה כפולה או חפיפה, ואין ניסיון חוזר) ולכן:
 *  - נעילה אטומית בשורה deck_queue_state (UPDATE מותנה + בעלים) – tick אחד בכל רגע, גם בין instances; תוקף הנעילה > maxDuration של ה-route;
 *  - כל שלב נשמר ב-DB מיד אחרי המעבר, וכשל באמצע מנוסה שוב ב-tick הבא;
 *  - תקציב זמן: אחרי TICK_SOFT_DEADLINE_MS לא מתחילים הפקות חדשות (כדי שה-route לא ייהרג באמצע קריאה שאינה אידמפוטנטית);
 *  - כשאין מה לעשות ה-tick לא נועל, לא מתחבר לנוטבוק ולא כותב ל-DB (Neon יכול לנוח).
 * סקירה עצמאית (2026-11-09) הובילה לכל הסעיפים האלה; ר' docs/deck-queue-vercel.md.
 */
export const TICK_LOCK_SECONDS = 330; // maxDuration של ה-route = 300
export const TICK_SOFT_DEADLINE_MS = 200_000;

export type TickResult = {
  ran: boolean;
  skipped?: "kill_switch" | "locked" | "no_work";
  error?: string;
  summary?: string;
  active?: number;
  waiting?: number;
  started?: number;
  done?: number;
};

const mins = (n: number) => sql`now() + make_interval(mins => ${Math.round(n)}::int)` as unknown as Date;
const nowSql = () => sql`now()` as unknown as Date;

type RunJob = {
  id: string;
  stage: string;
  notebookId: string | null;
  oracleJobId: string | null;
  artifactId: string | null;
  tries: number;
  pollErrors: number;
  elapsedMs: number | null;
};

async function patchJob(id: string, set: Partial<typeof deckJobs.$inferInsert>) {
  await db.update(deckJobs).set({ ...set, updatedAt: nowSql() }).where(eq(deckJobs.id, id));
}

async function applyDecision(c: OracleClient, job: RunJob, d: Decision, log: string[]): Promise<"done" | "keep" | "other"> {
  switch (d.kind) {
    case "keep":
      return "keep";
    case "startGenerate": {
      const [full] = await db.select({ description: deckJobs.description }).from(deckJobs).where(eq(deckJobs.id, job.id)).limit(1);
      const jobId = await startGenerate(c, job.notebookId!, full.description);
      await patchJob(job.id, { stage: "gen", oracleJobId: jobId, pollErrors: 0 });
      return "other";
    }
    case "startDownload": {
      const jobId = await startDownload(c, job.notebookId!, d.artifactId);
      await patchJob(job.id, { stage: "dl", oracleJobId: jobId, artifactId: d.artifactId, pollErrors: 0 });
      return "other";
    }
    case "finishDownload": {
      const bytes = await c.downloadPdf(job.oracleJobId!);
      const up = await uploadRawImages(`${job.id}-images.pdf`, bytes);
      await patchJob(job.id, { stage: "done", imagesFileId: up.fileId, imagesBytes: up.size, error: null, finishedAt: nowSql() });
      await deleteNotebook(c, job.notebookId);
      log.push(`מוכן ${job.id} (${(up.size / 1048576).toFixed(1)}MB)`);
      return "done";
    }
    case "waitRate":
      await deleteNotebook(c, job.notebookId);
      await patchJob(job.id, { stage: "wait", retryAfter: mins(d.minutes), notebookId: null, oracleJobId: null, artifactId: null, pollErrors: 0 });
      log.push(`מכסה: ${job.id} ממתין ${d.minutes} דקות`);
      return "other";
    case "retry":
      if (job.stage === "dl") {
        // כשל בהורדה/שמירה: המצגת כבר קיימת במחברת – שולחים בקשת הורדה חדשה (אם ה-artifact ידוע) ולא יוצרים מחדש (חוסך מכסה)
        const newJob = job.artifactId && job.notebookId ? await startDownload(c, job.notebookId, job.artifactId).catch(() => null) : null;
        await patchJob(job.id, { tries: d.tries, error: null, pollErrors: 0, ...(newJob ? { oracleJobId: newJob } : {}) });
      } else {
        await deleteNotebook(c, job.notebookId);
        await patchJob(job.id, { stage: "wait", tries: d.tries, retryAfter: mins(d.minutes), notebookId: null, oracleJobId: null, artifactId: null, pollErrors: 0 });
      }
      log.push(`נסיון חוזר ${job.id} (${d.tries})`);
      return "other";
    case "fail":
      // כשל בהורדה: משאירים את המחברת בשרת להצלה ידנית; בשאר המקרים מנקים
      if (job.stage !== "dl") await deleteNotebook(c, job.notebookId);
      await patchJob(job.id, { stage: "failed", error: `${d.reason}${job.stage === "dl" && job.notebookId ? ` [מחברת ${job.notebookId} נשארה בשרת, המצגת בתוכה]` : ""}`.slice(0, 500), finishedAt: nowSql() });
      log.push(`נכשל ${job.id}: ${d.reason.slice(0, 100)}`);
      return "other";
  }
}

async function advance(c: OracleClient, job: RunJob, log: string[]): Promise<"done" | "keep" | "other"> {
  const view = { stage: job.stage as Stage, tries: job.tries, elapsedMs: job.elapsedMs };
  // 1. שליפת הסטטוס (GET בלבד): תקלת רשת רגעית לא הורסת הפקה רצה – סופרים כשלים רצופים
  let status;
  try {
    const r = await c.call("GET", `/api/jobs/${encodeURIComponent(job.oracleJobId!)}`);
    status = parseOracleJob(r.json);
    if (job.pollErrors > 0) await patchJob(job.id, { pollErrors: 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const d = decideOnPollError(view, job.pollErrors, msg);
    if (d.kind === "keep") {
      await patchJob(job.id, { pollErrors: job.pollErrors + 1 }).catch(() => {});
      return "keep";
    }
    try {
      return await applyDecision(c, job, d, log);
    } catch (e2) {
      log.push(`שגיאה בטיפול ב-${job.id}: ${(e2 instanceof Error ? e2.message : String(e2)).slice(0, 120)}`);
      return "other";
    }
  }
  // 2. ביצוע ההחלטה; חריגה כאן (קריאה משנה-מצב/הורדה/העלאה) מטופלת לפי השלב
  try {
    return await applyDecision(c, job, decideRunning(view, status), log);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      return await applyDecision(c, job, decideOnException(view, msg), log);
    } catch (e2) {
      log.push(`שגיאה בטיפול ב-${job.id}: ${(e2 instanceof Error ? e2.message : String(e2)).slice(0, 120)}`);
      return "other";
    }
  }
}

export async function runDeckQueueTick(opts: { ignoreKill?: boolean } = {}): Promise<TickResult> {
  // מסלול מהיר (בלי נעילה ובלי כתיבה): מתג חירום, או אין שום job שדורש פעולה
  let [st] = await db.select().from(deckQueueState).where(eq(deckQueueState.id, 1)).limit(1);
  if (!st) {
    await db.insert(deckQueueState).values({ id: 1, killSwitch: true }).onConflictDoNothing();
    [st] = await db.select().from(deckQueueState).where(eq(deckQueueState.id, 1)).limit(1);
  }
  if (st?.killSwitch && !opts.ignoreKill) return { ran: false, skipped: "kill_switch" };
  const [{ n: actionable }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deckJobs)
    .where(or(inArray(deckJobs.stage, ["new", "src", "gen", "dl"]), and(eq(deckJobs.stage, "wait"), sql`(${deckJobs.retryAfter} IS NULL OR ${deckJobs.retryAfter} <= now())`)));
  if (!Number(actionable)) return { ran: false, skipped: "no_work" };

  const owner = randomUUID();
  const locked = await db
    .update(deckQueueState)
    .set({ lockUntil: sql`now() + make_interval(secs => ${TICK_LOCK_SECONDS}::int)` as unknown as Date, lockOwner: owner })
    .where(and(eq(deckQueueState.id, 1), or(isNull(deckQueueState.lockUntil), sql`${deckQueueState.lockUntil} < now()`)))
    .returning({ id: deckQueueState.id });
  if (!locked.length) return { ran: false, skipped: "locked" };

  const t0 = Date.now();
  const log: string[] = [];
  let result: TickResult = { ran: true };
  let lastError: string | null = null;
  try {
    // בלי sourceText/description (כל אחד ~כמה KB × מאות jobs בכל דקה): הם נשלפים רק לג'וב שמתחיל באמת
    const rows = await db
      .select({
        id: deckJobs.id,
        stage: deckJobs.stage,
        notebookId: deckJobs.notebookId,
        oracleJobId: deckJobs.oracleJobId,
        artifactId: deckJobs.artifactId,
        tries: deckJobs.tries,
        pollErrors: deckJobs.pollErrors,
        due: sql<boolean>`(${deckJobs.retryAfter} IS NULL OR ${deckJobs.retryAfter} <= now())`,
        elapsedMs: sql<number | null>`(extract(epoch from (now() - ${deckJobs.startedAt})) * 1000)::float8`,
      })
      .from(deckJobs)
      .where(inArray(deckJobs.stage, ["new", "src", "gen", "dl", "wait"]))
      .orderBy(asc(deckJobs.createdAt), asc(deckJobs.id));

    const maxC = st?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    const c = await oracleLogin();
    const running = rows.filter((r) => isRunning(r.stage));
    const outcomes = await Promise.all(running.map((r) => advance(c, { ...r, elapsedMs: r.elapsedMs === null ? null : Number(r.elapsedMs) }, log)));
    const done = outcomes.filter((o) => o === "done").length;

    // כמה עדיין רצות: קוראים מחדש מה-DB (מי שהסתיים/נכשל/עבר להמתנה לא נספר)
    const [{ n: activeNow }] = await db.select({ n: sql<number>`count(*)::int` }).from(deckJobs).where(inArray(deckJobs.stage, ["src", "gen", "dl"]));
    const candidates = rows.filter((r) => r.stage === "new" || (r.stage === "wait" && r.due));
    let started = 0;
    let exhausted = false;
    if (candidates.length) {
      exhausted = await allSlidesExhausted(c);
      let slots = slotsToStart(Number(activeNow), maxC, exhausted);
      for (const r of candidates) {
        if (slots <= 0) break;
        if (Date.now() - t0 > TICK_SOFT_DEADLINE_MS) {
          log.push("תקציב הזמן נגמר – הפקות חדשות יתחילו ב-tick הבא");
          break;
        }
        try {
          const [full] = await db.select({ sourceText: deckJobs.sourceText }).from(deckJobs).where(eq(deckJobs.id, r.id)).limit(1);
          const nb = await startNotebook(c, r.id, full.sourceText);
          await patchJob(r.id, { stage: "src", notebookId: nb.notebookId, oracleJobId: nb.oracleJobId, artifactId: null, pollErrors: 0, startedAt: nowSql() });
          slots--;
          started++;
          log.push(`התחיל ${r.id}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const d = decideOnException({ stage: "new", tries: r.tries, elapsedMs: null }, msg);
          if (d.kind === "fail") await patchJob(r.id, { stage: "failed", error: d.reason, finishedAt: nowSql() });
          else if (d.kind === "retry") await patchJob(r.id, { stage: "wait", tries: d.tries, retryAfter: mins(d.minutes) });
          log.push(`התחלה נכשלה ${r.id}: ${msg.slice(0, 100)}`);
        }
      }
    }
    const [{ w }] = await db.select({ w: sql<number>`count(*)::int` }).from(deckJobs).where(inArray(deckJobs.stage, ["new", "wait"]));
    const active = Number(activeNow) + started;
    result = {
      ran: true,
      active,
      waiting: Number(w),
      started,
      done,
      summary: `פעילים ${active}, ממתינים ${w}, התחילו ${started}, הסתיימו ${done}${exhausted ? " (כל החשבונות מוצו)" : ""}${log.length ? " | " + log.join(" ; ") : ""}`.slice(0, 900),
    };
  } catch (e) {
    lastError = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    result = { ran: true, error: lastError, summary: `tick נכשל: ${lastError}` };
  } finally {
    // משחררים רק נעילה שהיא שלנו (tick איטי שנעילתו פגה לא ישחרר נעילה של tick אחר)
    await db
      .update(deckQueueState)
      .set({
        lockUntil: sql`CASE WHEN ${deckQueueState.lockOwner} = ${owner} THEN NULL ELSE ${deckQueueState.lockUntil} END` as unknown as Date,
        lockOwner: sql`CASE WHEN ${deckQueueState.lockOwner} = ${owner} THEN NULL ELSE ${deckQueueState.lockOwner} END` as unknown as string,
        lastTickAt: nowSql(),
        lastTickSummary: result.summary ?? null,
        lastError,
        ticks: sql`${deckQueueState.ticks} + 1` as unknown as number,
        updatedAt: nowSql(),
      })
      .where(eq(deckQueueState.id, 1));
  }
  return result;
}
