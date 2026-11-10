/** לוגיקה טהורה של מערכת הפניות (בלי DB) – נבדקת ב-scripts/inquiries-logic.test.ts */
import { INQUIRY_TEMPLATES, type InquiryTemplate } from "./inquiry-templates";

export const INQUIRY_STATUSES = ["open", "answered", "closed", "spam"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  open: "ממתינה למענה",
  answered: "נענתה",
  closed: "נסגרה",
  spam: "ספאם",
};

export const SIGNATURE = "צוות לו״ז העניין";
export const MAX_SUBJECT = 200;
export const MAX_REPLY = 10000;

export function isInquiryStatus(v: unknown): v is InquiryStatus {
  return typeof v === "string" && (INQUIRY_STATUSES as readonly string[]).includes(v);
}

const DAY = 24 * 60 * 60 * 1000;

/** ממוצע זמן המענה (מילישניות) על פניות שיש להן answeredAt אחרי createdAt; null אם אין אף אחת */
export function averageResponseMs(rows: { createdAt: Date | string; answeredAt: Date | string | null }[]): number | null {
  const diffs: number[] = [];
  for (const r of rows) {
    if (!r.answeredAt) continue;
    const d = new Date(r.answeredAt).getTime() - new Date(r.createdAt).getTime();
    if (Number.isFinite(d) && d >= 0) diffs.push(d);
  }
  if (!diffs.length) return null;
  return diffs.reduce((a, b) => a + b, 0) / diffs.length;
}

/** "1.5 ימים" / "3 שעות" / "20 דקות" / "—" */
export function formatResponseTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms >= DAY) {
    const days = Math.round((ms / DAY) * 10) / 10;
    return days === 1 ? "יום" : `${days} ימים`;
  }
  const hours = ms / (60 * 60 * 1000);
  if (hours >= 1) {
    const h = Math.round(hours);
    return h === 1 ? "שעה" : `${h} שעות`;
  }
  const mins = Math.max(1, Math.round(ms / 60000));
  return mins === 1 ? "דקה" : `${mins} דקות`;
}

/** נושא מייל בטוח: שורה אחת (מונע הזרקת כותרות), רווחים מכווצים, מקוצר */
export function cleanSubject(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, MAX_SUBJECT);
}

export function defaultReplySubject(topic: string | null | undefined): string {
  const t = topic ? cleanSubject(topic) : "";
  return t ? `תגובה לפנייתך — ${t}` : "תגובה לפנייתך";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** ממלא את מצייני המקום בתבנית */
export function renderTemplate(t: InquiryTemplate, vars: { name: string; pricingUrl: string }): string {
  return t.body.replaceAll("{שם}", firstName(vars.name)).replaceAll("{קישור_מחירים}", vars.pricingUrl);
}

export function pickTemplate(id: string | null | undefined): InquiryTemplate | null {
  return INQUIRY_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** גוף המייל היוצא: הטקסט כפי שנכתב + חתימה (אם עוד אין) */
export function buildReplyBody(text: string): string {
  const body = text.replace(/\r\n/g, "\n").trim();
  return body.includes(SIGNATURE) ? body : `${body}\n\nבברכה,\n${SIGNATURE}`;
}

/** תיאור קצר להצגה ברשימה: שורה אחת, מקוצר */
export function previewText(s: string, max = 140): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}
