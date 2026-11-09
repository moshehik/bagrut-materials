import test from "node:test";
import assert from "node:assert/strict";
import { decideOnPollError, decideOnException, decideRunning, isValidJobId, parseOracleJob, slotsToStart, MAX_DOWNLOAD_TRIES, MAX_TRIES } from "../src/lib/deck-queue/logic";

const job = (stage: "src" | "gen" | "dl", tries = 0, elapsedMs: number | null = 1000) => ({ stage, tries, elapsedMs });

test("parseOracleJob: מנרמל סטטוס, מכסה ו-task_id", () => {
  assert.deepEqual(parseOracleJob({ status: "DONE", result: { task_id: "a1" } }), { st: "done", rate: false, resultTaskId: "a1", raw: JSON.stringify({ status: "DONE", result: { task_id: "a1" } }) });
  assert.equal(parseOracleJob({ status: "error", error: "RateLimitError: x" }).rate, true);
  assert.equal(parseOracleJob(null).st, "");
});

test("src הסתיים → מתחילים יצירה; gen הסתיים → הורדה; dl הסתיים → שמירה", () => {
  assert.equal(decideRunning(job("src"), parseOracleJob({ status: "done" })).kind, "startGenerate");
  assert.deepEqual(decideRunning(job("gen"), parseOracleJob({ status: "done", result: { task_id: "t" } })), { kind: "startDownload", artifactId: "t" });
  assert.equal(decideRunning(job("dl"), parseOracleJob({ status: "done" })).kind, "finishDownload");
});

test("gen הסתיים בלי artifact → ניסיון חוזר (לא קורס)", () => {
  assert.equal(decideRunning(job("gen"), parseOracleJob({ status: "done" })).kind, "retry");
});

test("שגיאת מכסה → המתנה 15 דקות בלי לספור ניסיון; שגיאה רגילה → retry ואז fail", () => {
  assert.deepEqual(decideRunning(job("gen"), parseOracleJob({ status: "failed", error: "RateLimit" })), { kind: "waitRate", minutes: 15 });
  assert.deepEqual(decideRunning(job("gen", 0), parseOracleJob({ status: "failed" })), { kind: "retry", minutes: 5, tries: 1 });
  assert.equal(decideRunning(job("gen", MAX_TRIES - 1), parseOracleJob({ status: "failed" })).kind, "fail");
});

test("עדיין רץ → keep; חריגת זמן → fail", () => {
  assert.equal(decideRunning(job("gen"), parseOracleJob({ status: "running" })).kind, "keep");
  assert.equal(decideRunning(job("gen", 0, 61 * 60_000), parseOracleJob({ status: "running" })).kind, "fail");
});

test("כשל חריג: ב-dl ממשיכים מאותו שלב עד MAX_DOWNLOAD_TRIES; בשאר השלבים retry 5 דק' ואז fail", () => {
  assert.deepEqual(decideOnException(job("dl", 0), "x"), { kind: "retry", minutes: 1, tries: 1 });
  assert.equal(decideOnException(job("dl", MAX_DOWNLOAD_TRIES - 1), "x").kind, "fail");
  assert.deepEqual(decideOnException(job("src", 0), "x"), { kind: "retry", minutes: 5, tries: 1 });
  assert.equal(decideOnException(job("src", MAX_TRIES - 1), "x").kind, "fail");
});

test("שגיאת סטטוס ב-dl מנוסה מחדש (בלי fail מיידי), ובשאר השלבים — רק אחרי 10 כשלי polling רצופים", () => {
  assert.deepEqual(decideRunning(job("dl", 0), parseOracleJob({ status: "failed" })), { kind: "retry", minutes: 1, tries: 1 });
  assert.equal(decideRunning(job("dl", 5), parseOracleJob({ status: "failed" })).kind, "fail");
  assert.equal(decideOnPollError(job("gen"), 3, "timeout").kind, "keep");
  assert.equal(decideOnPollError(job("gen"), 9, "timeout").kind, "retry");
});

test("slotsToStart: רק פעילים נספרים; מכסה מוצתה = 0", () => {
  assert.equal(slotsToStart(2, 5, false), 3);
  assert.equal(slotsToStart(5, 5, false), 0);
  assert.equal(slotsToStart(7, 5, false), 0);
  assert.equal(slotsToStart(0, 5, true), 0);
});

test("isValidJobId", () => {
  assert.equal(isValidJobId("j202611041200-abc123"), true);
  assert.equal(isValidJobId("a b"), false);
  assert.equal(isValidJobId("../x"), false);
});
