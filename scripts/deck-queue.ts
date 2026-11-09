/**
 * ניהול תור הפקת המצגות (deck_jobs / deck_queue_state) מהמחשב. הכרון של Vercel מריץ את ה-tick; כאן רק שליחה, בדיקה ואיסוף.
 * הרצה: NODE_OPTIONS=--use-system-ca npx tsx --conditions=react-server scripts/deck-queue.ts <פקודה>
 *   submit --file <job.json>        מוסיף job {id,title,sourceText,description} (אם ה-id כבר קיים – לא נוגע בו). מדפיס JSON
 *   get --id <id> [--to <pdf>]      סטטוס job; כש-done ויש --to – מוריד את התמונות מהדרייב. מדפיס JSON (state: pending|done|failed|missing)
 *   status                          מצב כללי: מתג חירום, ספירות לפי שלב, jobs אחרונים
 *   kill | resume                   מתג חירום (kill = הכרון לא מתקדם; resume = ממשיך)
 *   set-max <n>                     הפקות במקביל (ברירת מחדל 5)
 *   retry --id <id>                 מחזיר job שנכשל לתור (stage=new, tries=0)
 *   tick                            מריץ tick אחד מקומית (כמו הכרון; מכבד מתג חירום; --force מתעלם ממנו)
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "node:fs";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import { deckJobs, deckQueueState } from "../src/db/schema";
import { driveFetchAuthed } from "../src/lib/driveBridgeCore";
import { isValidJobId } from "../src/lib/deck-queue/logic";
import { runDeckQueueTick } from "../src/lib/deck-queue/tick";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k: string) => {
  const i = args.indexOf("--" + k);
  return i < 0 ? null : args[i + 1] ?? null;
};
const out = (o: unknown) => console.log(JSON.stringify(o));

async function setKill(on: boolean) {
  await db.insert(deckQueueState).values({ id: 1, killSwitch: on }).onConflictDoUpdate({ target: deckQueueState.id, set: { killSwitch: on, updatedAt: sql`now()` as unknown as Date } });
}

async function main() {
  if (cmd === "submit") {
    const file = opt("file");
    if (!file) throw new Error("חסר --file");
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as { id: string; title?: string; sourceText: string; description: string };
    if (!isValidJobId(j.id)) throw new Error("id לא תקין: " + j.id);
    if (!j.sourceText || !j.description) throw new Error("חסר sourceText או description");
    const ins = await db.insert(deckJobs).values({ id: j.id, title: j.title ?? "", sourceText: j.sourceText, description: j.description }).onConflictDoNothing().returning({ id: deckJobs.id });
    out({ ok: true, id: j.id, created: ins.length > 0 });
    return;
  }
  if (cmd === "get") {
    const id = opt("id");
    if (!id) throw new Error("חסר --id");
    const [r] = await db.select().from(deckJobs).where(eq(deckJobs.id, id)).limit(1);
    if (!r) return out({ ok: true, state: "missing" });
    if (r.stage === "failed") return out({ ok: true, state: "failed", error: r.error });
    if (r.stage !== "done") return out({ ok: true, state: "pending", stage: r.stage, tries: r.tries });
    if (!r.imagesFileId) return out({ ok: true, state: "failed", error: "ה-job מסומן done אבל אין fileId לתמונות" });
    const to = opt("to");
    if (to) {
      const res = await driveFetchAuthed(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(r.imagesFileId)}?alt=media`, {}, { tries: 3, timeoutMs: 300_000 });
      if (!res.ok) throw new Error(`הורדה מדרייב נכשלה (${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.subarray(0, 4).toString() !== "%PDF") throw new Error("הקובץ בדרייב אינו PDF");
      fs.writeFileSync(to, buf);
      return out({ ok: true, state: "done", bytes: buf.length, fileId: r.imagesFileId });
    }
    return out({ ok: true, state: "done", fileId: r.imagesFileId, bytes: r.imagesBytes });
  }
  if (cmd === "status") {
    const [st] = await db.select().from(deckQueueState).where(eq(deckQueueState.id, 1)).limit(1);
    const by = await db.select({ stage: deckJobs.stage, n: sql<number>`count(*)::int` }).from(deckJobs).groupBy(deckJobs.stage);
    const recent = await db.select({ id: deckJobs.id, stage: deckJobs.stage, tries: deckJobs.tries, error: deckJobs.error }).from(deckJobs).orderBy(desc(deckJobs.updatedAt)).limit(12);
    out({ ok: true, state: st ?? null, byStage: by, recent });
    return;
  }
  if (cmd === "kill" || cmd === "resume") {
    await setKill(cmd === "kill");
    out({ ok: true, killSwitch: cmd === "kill" });
    return;
  }
  if (cmd === "set-max") {
    const n = parseInt(args[1] ?? "", 10);
    if (!(n >= 1 && n <= 10)) throw new Error("set-max מקבל מספר 1-10");
    await db.insert(deckQueueState).values({ id: 1, maxConcurrent: n }).onConflictDoUpdate({ target: deckQueueState.id, set: { maxConcurrent: n } });
    out({ ok: true, maxConcurrent: n });
    return;
  }
  if (cmd === "retry") {
    const id = opt("id");
    if (!id) throw new Error("חסר --id");
    const r = await db.update(deckJobs).set({ stage: "new", tries: 0, error: null, notebookId: null, oracleJobId: null, retryAfter: null, finishedAt: null }).where(and(eq(deckJobs.id, id), inArray(deckJobs.stage, ["failed", "wait"]))).returning({ id: deckJobs.id });
    out({ ok: true, requeued: r.length });
    return;
  }
  if (cmd === "tick") {
    const hard = setTimeout(() => { console.error(JSON.stringify({ ok: false, error: "tick חרג מ-320 שניות" })); process.exit(2); }, 320_000);
    out(await runDeckQueueTick({ ignoreKill: args.includes("--force") }));
    clearTimeout(hard);
    return;
  }
  throw new Error("פקודות: submit | get | status | kill | resume | set-max | retry | tick");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(JSON.stringify({ ok: false, error: String(e?.message ?? e) }));
    process.exit(1);
  },
);
