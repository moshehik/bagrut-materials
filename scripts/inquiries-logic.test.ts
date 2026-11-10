import { test } from "node:test";
import assert from "node:assert/strict";
import {
  averageResponseMs,
  formatResponseTime,
  cleanSubject,
  defaultReplySubject,
  renderTemplate,
  pickTemplate,
  buildReplyBody,
  isInquiryStatus,
  previewText,
  SIGNATURE,
} from "../src/lib/inquiry-logic";
import { INQUIRY_TEMPLATES } from "../src/lib/inquiry-templates";

const H = 3600_000;

test("averageResponseMs: ממוצע רק על פניות שנענו, מתעלם משליליים", () => {
  const t0 = new Date("2026-11-01T10:00:00Z");
  const rows = [
    { createdAt: t0, answeredAt: new Date(t0.getTime() + 2 * H) },
    { createdAt: t0, answeredAt: new Date(t0.getTime() + 4 * H) },
    { createdAt: t0, answeredAt: null },
    { createdAt: t0, answeredAt: new Date(t0.getTime() - H) },
  ];
  assert.equal(averageResponseMs(rows), 3 * H);
  assert.equal(averageResponseMs([]), null);
  assert.equal(averageResponseMs([{ createdAt: t0, answeredAt: null }]), null);
});

test("averageResponseMs: מקבל מחרוזות תאריך", () => {
  assert.equal(averageResponseMs([{ createdAt: "2026-11-01T10:00:00Z", answeredAt: "2026-11-01T11:00:00Z" }]), H);
});

test("formatResponseTime", () => {
  assert.equal(formatResponseTime(null), "—");
  assert.equal(formatResponseTime(36 * H), "1.5 ימים");
  assert.equal(formatResponseTime(24 * H), "יום");
  assert.equal(formatResponseTime(3 * H), "3 שעות");
  assert.equal(formatResponseTime(H), "שעה");
  assert.equal(formatResponseTime(20 * 60000), "20 דקות");
  assert.equal(formatResponseTime(1000), "דקה");
});

test("cleanSubject: שורה אחת, בלי הזרקת כותרות, מקוצר", () => {
  assert.equal(cleanSubject("  שלום\r\nBcc: x@y.com  "), "שלום Bcc: x@y.com");
  assert.ok(!/[\r\n]/.test(cleanSubject("a\nb\r\nc")));
  assert.equal(cleanSubject("x".repeat(500)).length, 200);
});

test("defaultReplySubject", () => {
  assert.equal(defaultReplySubject("בעיה בהורדה"), "תגובה לפנייתך — בעיה בהורדה");
  assert.equal(defaultReplySubject(null), "תגובה לפנייתך");
  assert.equal(defaultReplySubject("  "), "תגובה לפנייתך");
});

test("תבניות: בחירה ומילוי שם פרטי וקישור", () => {
  assert.equal(pickTemplate("nope"), null);
  assert.equal(pickTemplate(null), null);
  const t = pickTemplate("subscription")!;
  const out = renderTemplate(t, { name: "רחל כהן", pricingUrl: "https://example.org/pricing" });
  assert.ok(out.startsWith("שלום רחל,"));
  assert.ok(out.includes("https://example.org/pricing"));
  assert.ok(!out.includes("{"));
  for (const tpl of INQUIRY_TEMPLATES) {
    assert.ok(!renderTemplate(tpl, { name: "מרים", pricingUrl: "u" }).includes("{"), tpl.id);
  }
});

test("buildReplyBody: מוסיף חתימה פעם אחת", () => {
  const once = buildReplyBody("שלום,\r\nתודה");
  assert.ok(once.endsWith(SIGNATURE));
  assert.ok(!once.includes("\r"));
  assert.equal(buildReplyBody(once), once);
});

test("isInquiryStatus + previewText", () => {
  assert.ok(isInquiryStatus("spam"));
  assert.ok(!isInquiryStatus("deleted"));
  assert.equal(previewText("a\n\n b   c", 100), "a b c");
  assert.equal(previewText("abcdef", 3), "abc…");
});
