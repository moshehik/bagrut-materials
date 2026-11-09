/**
 * בדיקות ללוגיקת גיבוי מסד הנתונים. הרצה: npx tsx --test scripts/db-backup-logic.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  backupFileName,
  parseBackupName,
  isoWeekKey,
  selectRetention,
  isBackupDue,
  shouldAlert,
  sortTablesByFk,
  EMPTY_STATE,
  parseState,
  quoteIdent,
} from "../src/lib/db-backup/logic";

test("שם קובץ הולך הלוך וחזור", () => {
  const d = new Date(Date.UTC(2026, 10, 9, 1, 5));
  const n = backupFileName(d);
  assert.equal(n, "bagrut-db-2026-11-09-0105.json.gz");
  assert.equal(parseBackupName(n)?.getTime(), d.getTime());
  assert.equal(parseBackupName("something.txt"), null);
  assert.equal(parseBackupName("bagrut-db-2026-13-40-9999.json.gz")?.getTime() ?? null, parseBackupName("bagrut-db-2026-13-40-9999.json.gz")?.getTime() ?? null);
});

test("שבוע ISO", () => {
  assert.equal(isoWeekKey(new Date(Date.UTC(2026, 0, 1))), "2026-W01");
  assert.equal(isoWeekKey(new Date(Date.UTC(2026, 11, 31))), "2026-W53");
  assert.equal(isoWeekKey(new Date(Date.UTC(2026, 10, 9))), "2026-W46");
});

function days(n: number, start = new Date(Date.UTC(2026, 10, 9, 1, 0))): string[] {
  return Array.from({ length: n }, (_, i) => backupFileName(new Date(start.getTime() - i * 86_400_000)));
}

test("שימור: 14 יומיים + שבועי לישנים, ולא נוגע בקבצים זרים", () => {
  const names = [...days(80), "README.txt"];
  const { keep, remove } = selectRetention(names);
  const daily = days(14);
  for (const n of daily) assert.ok(keep.includes(n), n);
  assert.ok(!remove.includes("README.txt"));
  assert.ok(!keep.includes("README.txt"));
  // שבועי: לכל היותר 8 מעבר ל-14 היומיים
  assert.ok(keep.length <= 14 + 8, String(keep.length));
  assert.ok(keep.length > 14);
  assert.equal(keep.length + remove.length, 80);
});

test("שימור: כמה גיבויים באותו יום — נשאר האחרון", () => {
  const a = backupFileName(new Date(Date.UTC(2026, 10, 9, 1, 0)));
  const b = backupFileName(new Date(Date.UTC(2026, 10, 9, 7, 0)));
  const { keep, remove } = selectRetention([a, b]);
  assert.deepEqual(keep, [b]);
  assert.deepEqual(remove, [a]);
});

test("שימור: מעט גיבויים — לא מוחקים כלום", () => {
  const { remove } = selectRetention(days(5));
  assert.deepEqual(remove, []);
});

test("isBackupDue", () => {
  const now = new Date(Date.UTC(2026, 10, 9, 7, 0));
  assert.equal(isBackupDue(EMPTY_STATE, now), true);
  assert.equal(isBackupDue({ ...EMPTY_STATE, lastOkAt: new Date(now.getTime() - 6 * 3_600_000).toISOString() }, now), false);
  assert.equal(isBackupDue({ ...EMPTY_STATE, lastOkAt: new Date(now.getTime() - 21 * 3_600_000).toISOString() }, now), true);
  assert.equal(isBackupDue({ ...EMPTY_STATE, lastOkAt: now.toISOString() }, now, true), true);
});

test("shouldAlert: אחרי שני כשלונות, ולא יותר מפעם ב-12 שעות", () => {
  const now = new Date(Date.UTC(2026, 10, 9, 7, 0));
  assert.equal(shouldAlert({ ...EMPTY_STATE, consecutiveFailures: 1 }, now), false);
  assert.equal(shouldAlert({ ...EMPTY_STATE, consecutiveFailures: 2 }, now), true);
  assert.equal(shouldAlert({ ...EMPTY_STATE, consecutiveFailures: 3, lastAlertAt: new Date(now.getTime() - 3_600_000).toISOString() }, now), false);
  assert.equal(shouldAlert({ ...EMPTY_STATE, consecutiveFailures: 3, lastAlertAt: new Date(now.getTime() - 13 * 3_600_000).toISOString() }, now), true);
});

test("מיון טופולוגי של טבלאות", () => {
  const r = sortTablesByFk(["posts", "users", "threads", "self"], [
    { table: "posts", refTable: "threads" },
    { table: "threads", refTable: "users" },
    { table: "posts", refTable: "users" },
    { table: "self", refTable: "self" },
  ]);
  assert.deepEqual(r.cyclic, []);
  assert.ok(r.order.indexOf("users") < r.order.indexOf("threads"));
  assert.ok(r.order.indexOf("threads") < r.order.indexOf("posts"));
  const c = sortTablesByFk(["a", "b"], [{ table: "a", refTable: "b" }, { table: "b", refTable: "a" }]);
  assert.deepEqual(c.cyclic, ["a", "b"]);
});

test("parseState ו-quoteIdent", () => {
  assert.deepEqual(parseState("not json"), EMPTY_STATE);
  assert.equal(parseState(JSON.stringify({ consecutiveFailures: 3 })).consecutiveFailures, 3);
  assert.equal(quoteIdent('a"b'), '"a""b"');
});
