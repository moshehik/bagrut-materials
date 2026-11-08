/** בדיקות לסכימת ה-API של הסוכן (src/lib/general-fix-protocol.ts): npx tsx --test scripts/general-fix-protocol.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgentRequest } from "../src/lib/general-fix-protocol";

test("answer: note שמזכיר את ספריית המקור נדחה בהודעה ברורה בעברית", () => {
  const r = parseAgentRequest({ action: "answer", fixId: 27, note: "הדברים הובאו מפירוש אבן עזרא כפי שהוא מופיע בספריא.", apply: true });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.match(r.error, /note/);
    assert.match(r.error, /ספריא/);
  }
});

test("answer: note נקי מתקבל; reject (הערה פנימית) לא מוגבל", () => {
  assert.equal(parseAgentRequest({ action: "answer", fixId: 27, note: "נוסף פירוש אבן עזרא לפסוק י״ב." }).ok, true);
  assert.equal(parseAgentRequest({ action: "reject", fixId: 27, note: "ניסיון הנחיה; המקור נבדק בספריא" }).ok, true);
});

test("get/check: base ו-against ברירת מחדל viewer, shared מתקבל", () => {
  const g = parseAgentRequest({ action: "get", fixId: 5 });
  assert.ok(g.ok && g.req.action === "get" && g.req.base === "viewer");
  const g2 = parseAgentRequest({ action: "get", fixId: 5, base: "shared" });
  assert.ok(g2.ok && g2.req.action === "get" && g2.req.base === "shared");
  assert.equal(parseAgentRequest({ action: "get", fixId: 5, base: "x" }).ok, false);
});
