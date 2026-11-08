/** בדיקות ללוגיקת השרשור של הערות כלליות (src/lib/private-version-logic.ts): npx tsx --test scripts/fix-thread-logic.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_THREAD_TURNS,
  correctionSignature,
  correctionSignatureOf,
  generalStatusLabel,
  groupThreads,
  latestGeneral,
  threadState,
  threadViews,
  type GeneralComplaintView,
} from "../src/lib/private-version-logic";

const g = (id: number, over: Partial<GeneralComplaintView> = {}): GeneralComplaintView => ({
  id,
  status: "answered",
  replyText: "תשובה",
  createdAt: new Date(2026, 10, 1, 10, id),
  requestText: `הודעה ${id}`,
  parentId: null,
  turn: 1,
  commentators: false,
  ...over,
});

test("שרשור: הודעות המשך מקובצות להערה הראשונה, לפי turn", () => {
  const list = [g(12, { parentId: 10, turn: 2 }), g(10), g(20), g(15, { parentId: 10, turn: 3, status: "pending", replyText: null })];
  const threads = groupThreads(list);
  assert.equal(threads.length, 2);
  assert.deepEqual(threads[0].items.map((x) => x.id), [10, 12, 15]);
  assert.equal(threads[0].rootId, 10);
  assert.deepEqual(threads[1].items.map((x) => x.id), [20]);
});

test("מצב שרשור: ממתין / אפשר להמשיך / מוצה אחרי 5 הודעות", () => {
  const mk = (n: number, lastStatus: string) => {
    const items = Array.from({ length: n }, (_, i) => g(100 + i, { parentId: i === 0 ? null : 100, turn: i + 1, status: i === n - 1 ? lastStatus : "answered" }));
    return groupThreads(items)[0];
  };
  assert.deepEqual(threadState(mk(1, "pending")), { waiting: true, used: 1, left: 4, canReply: false });
  assert.deepEqual(threadState(mk(1, "answered")), { waiting: false, used: 1, left: 4, canReply: true });
  assert.deepEqual(threadState(mk(3, "private")), { waiting: false, used: 3, left: 2, canReply: true });
  assert.deepEqual(threadState(mk(MAX_THREAD_TURNS, "answered")), { waiting: false, used: 5, left: 0, canReply: false });
  assert.equal(MAX_THREAD_TURNS, 5);
});

test("חתימה: לא תלויה בסדר השורות, ומשתנה כשהודעת המשך נוספת או סטטוס משתנה", () => {
  const a = g(1);
  const b = g(2, { parentId: 1, turn: 2, status: "pending", replyText: null });
  const s1 = correctionSignature({ privateVersion: null, general: [a, b] });
  const s2 = correctionSignature({ privateVersion: null, general: [b, a] });
  assert.equal(s1, s2);
  assert.equal(s1, correctionSignatureOf(null, [{ id: 1, status: "answered" }, { id: 2, status: "pending" }]));
  const s3 = correctionSignature({ privateVersion: null, general: [a, { ...b, status: "private" }] });
  assert.notEqual(s1, s3);
  assert.notEqual(correctionSignature({ privateVersion: null, general: [a] }), s1);
  assert.equal(correctionSignature(undefined), "none");
});

test("התווית בכרטיסייה: הודעה ממתינה = שעון; latestGeneral בוחרת את האחרונה", () => {
  const a = g(1, { createdAt: new Date(2026, 10, 1, 9) });
  const b = g(2, { parentId: 1, turn: 2, status: "pending", replyText: null, createdAt: new Date(2026, 10, 1, 10) });
  assert.equal(latestGeneral([a, b])?.id, 2);
  assert.equal(generalStatusLabel(latestGeneral([a, b]))?.tone, "wait");
});

test("threadViews: נתונים פשוטים לדפדפן (תאריך כמחרוזת)", () => {
  const v = threadViews([g(1), g(2, { parentId: 1, turn: 2 })]);
  assert.equal(v.length, 1);
  assert.equal(typeof v[0].items[0].at, "string");
  assert.equal(v[0].items[1].text, "הודעה 2");
});
