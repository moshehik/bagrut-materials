/**
 * הלוגיקה הטהורה של התשלום דרך נדרים פלוס – בלי imports, בלי DB, בלי React: נטענת בשרת (api/pay/*, store.ts, sync.ts),
 * בדפדפן (components/pay/pay-client.tsx) ובבדיקות (scripts/nedarim-tests/logic.test.ts). תיעוד: docs/nedarim-payments.md.
 *
 * הזרימה: האתר יוצר בקשה (reference NP-…), מפנה את המורה לדף התשלום המתארח של נדרים (hostedPaymentUrl – פרמטרים שאומתו מול
 * הקוד של הדף עצמו, JavaScript5.js), ומזהה את התשלום בהיסטוריית העסקאות של המוסד (GetHistoryJson) לפי מזהה הבקשה בהערות,
 * ובמקרה הצורך לפי טלפון/מייל + סכום מדויק + חלון זמן (findCandidates / decideAutoMatches). האתר לא מקבל פרטי כרטיס לעולם.
 */

export const NEDARIM_HOSTED_BASE = "https://www.matara.pro/nedarimplus/online/";

export const NEDARIM_STATUSES = ["pending", "processing", "paid", "failed", "expired", "cancelled"] as const;
export type NedarimStatus = (typeof NEDARIM_STATUSES)[number];
/** סטטוסים שבהם הבקשה עדיין "חיה" ויכולה להפוך ל-paid */
export const OPEN_STATUSES: readonly NedarimStatus[] = ["pending", "processing"];
export const isNedarimStatus = (s: unknown): s is NedarimStatus =>
  typeof s === "string" && (NEDARIM_STATUSES as readonly string[]).includes(s);

export type VerifyMethod = "api" | "manual" | "simulated";

/** המסלולים שנמכרים דרך /pay (המסלולים החודשיים הישנים הוסרו – ר' RETIRED_PLANS ב-constants) */
export const PAYABLE_PLANS = ["yearly", "substitute_3m", "substitute_daily"] as const;
export type PayablePlan = (typeof PAYABLE_PLANS)[number];
export const isPayablePlan = (p: unknown): p is PayablePlan =>
  typeof p === "string" && (PAYABLE_PLANS as readonly string[]).includes(p);

export const REFERENCE_PREFIX = "NP-";
export const REFERENCE_RE = /^NP-[A-HJ-NP-Z2-9]{8}$/; // בלי I/O/0/1 (קריא בטלפון)
const REFERENCE_IN_TEXT_RE = /NP-[A-HJ-NP-Z2-9]{8}/;
export const MAX_BODY_BYTES = 8 * 1024;
/** בקשה 'pending' ישנה מזה נחשבת פגת תוקף (ניקוי במסך הניהול) – ועסקה לא תותאם לבקשה ישנה יותר */
export const INTENT_TTL_HOURS = 48;
/** עסקה יכולה להיות מתוארכת מעט לפני יצירת הבקשה (שעון שרת שונה) */
export const MATCH_EARLY_GRACE_MS = 15 * 60 * 1000;
/** עסקאות לא-משויכות ישנות מזה נמחקות מהמטמון (M6) */
export const TX_RETENTION_DAYS = 30;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** מזהה בקשה חדש NP-XXXXXXXX. randomBytes(n) → מערך בתים באורך n (crypto.randomBytes בשרת – אקראי קריפטוגרפי, לא רץ). */
export function generateReference(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(8);
  let out = REFERENCE_PREFIX;
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const isValidReference = (s: unknown): s is string => typeof s === "string" && REFERENCE_RE.test(s);

/** מוצא מזהה בקשה בתוך טקסט חופשי (הערת העסקה / Param1 שנדרים מחזירים) – או null */
export function extractReference(text: unknown): string | null {
  const m = String(text ?? "")
    .toUpperCase()
    .match(REFERENCE_IN_TEXT_RE);
  return m ? m[0] : null;
}

/** אגורות → מחרוזת שקלים ל-Amount של נדרים ("588" / "129.9") */
export function agorotToAmountString(agorot: number): string {
  const n = Math.max(0, Math.round(agorot));
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2).replace(/0$/, "");
}

/** מחרוזת/מספר שקלים (כמו שנדרים מחזירים) → אגורות, או null */
export function shekelsToAgorot(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** טלפון → ספרות בלבד בפורמט מקומי (972… → 0…), להשוואה בין הבקשה לעסקה */
export function phoneDigits(v: unknown): string {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("00972")) d = "0" + d.slice(5);
  else if (d.startsWith("972")) d = "0" + d.slice(3);
  else if (/^\d{9}$/.test(d) && d[0] !== "0") d = "0" + d;
  return d.slice(0, 15);
}

export const emailKey = (v: unknown) => String(v ?? "").trim().toLowerCase();

// ---------------------------------------------------------------------------------------------------------------- דף התשלום המתארח

/**
 * הקישור לדף התשלום המתארח של נדרים פלוס. רק פרמטרים שאומתו מול הקוד של הדף (JavaScript5.js, GetURLParameter/DecodeParam):
 *   mosad (חובה), Amount + AmountLock=1 (סכום נעול), Payment=1 + PaymentLock=1 (תשלום אחד), OnlyNormal=1 (חיוב רגיל בלבד –
 *   בלי הו"ק/ביט/העברה), OnlyShekel=1, ClientName / Phone / Email (ממולאים ונעולים), comment (הערה ממולאת ונעולה – הדף
 *   עצמו מנטרל את השדה), Analytic (מצורף לתחילת הערת העסקה: "NP-… | …" – ערוץ שני למזהה), Redirect (חזרה לאתר אחרי
 *   תשלום מוצלח), HideParameters=1 (הדף מסיר את הפרמטרים משורת הכתובת אחרי הטעינה – הטלפון/המייל לא נשארים בהיסטוריה).
 * אין בדף פרמטר CallBack ואין Param1/Param2 – ולכן הזיהוי הוא דרך ההערה (ראו findCandidates).
 */
export function hostedPaymentUrl(input: {
  mosadId: string;
  amountAgorot: number;
  reference: string;
  clientName: string;
  phone: string;
  email: string;
  comment: string;
  redirectUrl: string;
}): string {
  const q = new URLSearchParams();
  q.set("mosad", input.mosadId);
  q.set("Amount", agorotToAmountString(input.amountAgorot));
  q.set("AmountLock", "1");
  q.set("Payment", "1");
  q.set("PaymentLock", "1");
  q.set("OnlyNormal", "1");
  q.set("OnlyShekel", "1");
  if (input.clientName) q.set("ClientName", input.clientName.slice(0, 60));
  if (input.phone) q.set("Phone", input.phone.slice(0, 20));
  if (input.email) q.set("Email", input.email.slice(0, 120));
  q.set("comment", input.comment.slice(0, 150));
  q.set("Analytic", input.reference);
  if (input.redirectUrl) q.set("Redirect", input.redirectUrl);
  q.set("HideParameters", "1");
  return `${NEDARIM_HOSTED_BASE}?${q.toString()}`;
}

/** הערת העסקה שרואים בפורטל של נדרים ובהיסטוריה: שם האתר + המסלול + מזהה הבקשה */
export function buildTransactionComment(siteName: string, planLabel: string, reference: string): string {
  return [siteName.trim(), planLabel.trim(), reference].filter(Boolean).join(" - ").slice(0, 150);
}

// ---------------------------------------------------------------------------------------------------------------- היסטוריית העסקאות (GetHistoryJson)

function pick(obj: unknown, names: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  const lower = new Map(Object.keys(rec).map((k) => [k.toLowerCase(), k]));
  for (const n of names) {
    const k = lower.get(n.toLowerCase());
    if (k !== undefined && rec[k] !== undefined && rec[k] !== null && String(rec[k]) !== "") return String(rec[k]);
  }
  return undefined;
}

export const NEDARIM_TZ = "Asia/Jerusalem";
const tzFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NEDARIM_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** ה-offset (במילישניות) של Asia/Jerusalem מ-UTC ברגע נתון – דרך Intl, בלי תלות ב-TZ של השרת */
function jerusalemOffsetMs(utcMs: number): number {
  const parts = Object.fromEntries(tzFmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return wall - utcMs;
}

/** שעת קיר בירושלים → רגע UTC (כולל שעון קיץ; שתי איטרציות מכסות את גבולות ה-DST) */
export function jerusalemWallTimeToUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = wall - jerusalemOffsetMs(wall);
  utc = wall - jerusalemOffsetMs(utc);
  return new Date(utc);
}

/** בדיקת טווחים + round-trip (31.02 → null) לשעת קיר */
function validWallTime(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  if (!(y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59)) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** עסקה "מהעתיד" (מעבר ליום) = תאריך שגוי → null (N4) */
export const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/**
 * תאריך כפי שנדרים מחזירים (TransactionTime): dd/MM/yyyy HH:mm[:ss] או ISO בלי offset – שעת ירושלים (Asia/Jerusalem, בלי תלות
 * ב-TZ של השרת); ISO עם Z/offset – כפי שהוא; `/Date(ms[+zzzz])/` של ASP.NET – ms מאז epoch (UTC). אימות טווחים + round-trip;
 * dd/MM שאינו תקף (למשל 10/22/2026) **לא** מנוחש כ-MM/dd → null; תאריך עתידי מעבר ליום → null. `now` לבדיקות.
 */
export function parseNedarimDate(v: unknown, now: Date = new Date()): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let d: Date | null = null;
  const asp = s.match(/^\/?Date\((-?\d{1,16})(?:[+-]\d{4})?\)\/?$/);
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (asp) {
    d = new Date(Number(asp[1]));
  } else if (m) {
    const [y, mo, day, h, mi, sec] = [Number(m[3]), Number(m[2]), Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
    if (!validWallTime(y, mo, day, h, mi, sec)) return null; // גם כשהיה "תקף" כ-MM/dd – לא מנחשים
    d = jerusalemWallTimeToUtc(y, mo, day, h, mi, sec);
  } else if (iso) {
    const [y, mo, day, h, mi, sec] = [Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4]), Number(iso[5]), Number(iso[6] ?? 0)];
    if (!validWallTime(y, mo, day, h, mi, sec)) return null;
    d = jerusalemWallTimeToUtc(y, mo, day, h, mi, sec);
  } else {
    const t = Date.parse(s);
    d = Number.isNaN(t) ? null : new Date(t);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  if (d.getTime() > now.getTime() + MAX_FUTURE_MS) return null;
  if (d.getUTCFullYear() < 2000) return null;
  return d;
}

/**
 * מספר אישור (N3): נרמול + רשימת ערכי "אין": ריק/רווחים, 0 / 00…, false, null, undefined, n/a, na, none, -, —. חייב להכיל
 * לפחות ספרה או אות. מחזיר את הערך המנורמל (≤40) או null.
 */
export function normalizeConfirmation(v: unknown): string | null {
  if (v === null || v === undefined || v === false) return null;
  const s = String(v).trim().slice(0, 40);
  if (!s) return null;
  const low = s.toLowerCase();
  if (/^(0+|false|null|undefined|n\/a|na|none|nil|-+|—+|–+)$/.test(low)) return null;
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  return s;
}

/**
 * סטטוס עסקה (אם נדרים מחזירים שדה כזה – לא מתועד): "הצלחה" רק לערכים מוכרים; ערך לא מוכר = לא מאושר (fail-safe).
 * null = אין שדה סטטוס בשורה.
 */
export function transactionStatusOk(status: string | null | undefined): boolean | null {
  if (status === null || status === undefined || String(status).trim() === "") return null;
  const s = String(status).trim().toLowerCase();
  if (/(error|fail|declin|reject|cancel|pending|wait|refund|סירוב|נדח|בוטל|ממתין|שגיא|זיכוי|נכשל)/.test(s)) return false;
  if (/^(ok|success|succeeded|approved|completed|done|1|true|yes)$/.test(s) || /(אושר|מאושר|הצליח|בוצע|הושלם)/.test(s)) return true;
  return false;
}

/** עסקה "מאושרת" = יש מספר אישור אמיתי (normalizeConfirmation), ואם יש שדה סטטוס – הוא הצלחה. רק כאלה מתאימות אוטומטית. */
export function isApprovedTx(t: Pick<NormalizedTx, "confirmation" | "status">): boolean {
  if (!normalizeConfirmation(t.confirmation)) return false;
  const st = transactionStatusOk(t.status);
  return st === null || st === true;
}

export type NormalizedTx = {
  transactionId: string;
  /** באגורות (שלילי = זיכוי; 0 = בוטל) */
  amount: number;
  /** "1" = ש"ח, "2" = דולר (לפי התיעוד); null אם אין שדה */
  currency: string | null;
  phone: string;
  email: string;
  clientName: string | null;
  comments: string | null;
  confirmation: string | null;
  last4: string | null;
  /** שדה סטטוס/תוצאה אם קיים בשורה (לא מתועד) */
  status: string | null;
  /** isApprovedTx – יש אישור ואין סטטוס כישלון */
  approved: boolean;
  transactionAt: Date | null;
};

/** השדות היחידים שנשמרים ב-raw (M6): בלי ת"ז, כתובת, שם – רק מה שדרוש לאבחון ההתאמה */
export const RAW_KEEP_FIELDS = ["TransactionId", "Amount", "Currency", "Comments", "TransactionTime", "Confirmation", "LastNum", "Status", "TransactionType", "Groupe", "Tashloumim", "KabalaId"] as const;
export function pickRawFields(row: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of RAW_KEEP_FIELDS) {
    const v = pick(row, [k]);
    if (v !== undefined) out[k] = v.slice(0, 300);
  }
  return out;
}

/**
 * שורה מ-GetHistoryJson → מבנה מנורמל. שמות השדות לפי תיעוד ה-API של נדרים (TransactionId, Amount, Currency, Phone, Mail,
 * Comments, TransactionTime, ClientName, Confirmation, LastNum) עם סובלנות לשמות קרובים. null = אין מזהה עסקה.
 */
export function parseHistoryRow(row: unknown, now: Date = new Date()): NormalizedTx | null {
  const id = pick(row, ["TransactionId", "TransactionID", "Id"]);
  if (!id || !/^\d{1,30}$/.test(id.trim())) return null;
  const amount = shekelsToAgorot(pick(row, ["Amount", "Sum", "Schum"]));
  if (amount === null || !Number.isSafeInteger(amount)) return null;
  const t: NormalizedTx = clampTx({
    transactionId: id.trim(),
    amount,
    currency: pick(row, ["Currency"]) ?? null,
    phone: phoneDigits(pick(row, ["Phone", "Cellular", "Phone1", "Tel"])),
    email: emailKey(pick(row, ["Mail", "Email"])),
    clientName: pick(row, ["ClientName", "Name", "FullName"]) ?? null,
    comments: pick(row, ["Comments", "Comment", "Avour", "Param1"]) ?? null,
    confirmation: normalizeConfirmation(pick(row, ["Confirmation", "ConfirmationNumber", "AuthorisationNumber"])),
    last4: (pick(row, ["LastNum", "Last4", "CardLast4"]) ?? "").replace(/\D/g, "").slice(-4) || null,
    status: pick(row, ["Status", "Result", "TransactionStatus", "StatusDesc"]) ?? null,
    approved: false,
    transactionAt: parseNedarimDate(pick(row, ["TransactionTime", "Date", "CreateDate", "Time"]), now),
  });
  t.approved = isApprovedTx(t);
  return t;
}

/** אורכי העמודות של nedarim_transactions (N5) – חיתוך לפני insert, כדי ששורה ארוכה לא תפיל את הקריאה */
export const TX_COLUMN_LIMITS = { transactionId: 40, currency: 4, phone: 30, email: 255, clientName: 120, confirmation: 40, last4: 4, status: 30, comments: 2000 } as const;
export function clampTx<T extends NormalizedTx>(t: T): T {
  const cut = (v: string | null, n: number) => (v === null ? null : v.slice(0, n));
  return {
    ...t,
    transactionId: t.transactionId.slice(0, TX_COLUMN_LIMITS.transactionId),
    currency: cut(t.currency, TX_COLUMN_LIMITS.currency),
    phone: t.phone.slice(0, TX_COLUMN_LIMITS.phone),
    email: t.email.slice(0, TX_COLUMN_LIMITS.email),
    clientName: cut(t.clientName, TX_COLUMN_LIMITS.clientName),
    comments: cut(t.comments, TX_COLUMN_LIMITS.comments),
    confirmation: cut(t.confirmation, TX_COLUMN_LIMITS.confirmation),
    last4: cut(t.last4, TX_COLUMN_LIMITS.last4),
    status: cut(t.status, TX_COLUMN_LIMITS.status),
  };
}

/** חלוקה ל-chunks ל-insert ב-batch (N1) */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * עד איזה TransactionId מותר לקדם את last_transaction_id (N1/N5): המזהה הגבוה ביותר מבין השורות שנשמרו בהצלחה, ולעולם לא מעבר
 * לשורה שנכשלה (failedIndex = האינדקס הראשון שנכשל, או -1). ההיסטוריה עולה לפי מזהה, אז זה "עד השורה שלפני הכישלון".
 */
export function advanceLastId(ids: string[], failedIndex: number, current: number | null): number | null {
  let max = current ?? 0;
  const upto = failedIndex >= 0 ? failedIndex : ids.length;
  for (let i = 0; i < upto; i++) {
    const n = Number(ids[i]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max || null;
}

/** האם שתי בקשות "אותה הזמנה" (N2) – מסלול, מקצועות (ללא סדר), דלג, סכום */
export function sameIntentParams(
  a: { plan: string; categoryIds: number[]; subjectsPending: boolean; amount: number },
  b: { plan: string; categoryIds: number[]; subjectsPending: boolean; amount: number },
): boolean {
  const sa = [...new Set(a.categoryIds)].sort((x, y) => x - y).join(",");
  const sb = [...new Set(b.categoryIds)].sort((x, y) => x - y).join(",");
  return a.plan === b.plan && a.subjectsPending === b.subjectsPending && a.amount === b.amount && sa === sb;
}

/** בקשה "תקועה": processing (אישור ידני) מעבר ל-INTENT_TTL_HOURS – דורשת טיפול (N10) */
export function isStaleProcessing(status: string, createdAt: Date, now: Date = new Date()): boolean {
  return status === "processing" && createdAt.getTime() < now.getTime() - INTENT_TTL_HOURS * 3600_000;
}

/** בקשה paid שאין לה מנוי (N7) – צריך תיקון */
export function needsPurchaseRepair(status: string, purchaseId: number | null, existsByRef: boolean): boolean {
  return status === "paid" && !purchaseId && !existsByRef;
}

export const isIls = (currency: string | null) =>
  currency === null || currency === "1" || currency.includes("₪") || /ils|nis|ש"ח|שח/i.test(currency);

export type OpenPaymentForMatch = {
  id: number;
  reference: string;
  /** באגורות */
  amount: number;
  phone: string | null;
  email: string | null;
  createdAt: Date;
};
export type TxForMatch = NormalizedTx & { fetchedAt: Date; matchedPaymentId: number | null };

/**
 * מועמדות להתאמה לבקשה: עסקה מאושרת (יש Confirmation, ואין סטטוס כישלון), סכום זהה בדיוק, ש"ח, לא משויכת, עם מועד עסקה
 * מפוענח (בלי מועד – לא מועמדת; לא משתמשים במועד הקריאה), שאינו לפני יצירת הבקשה (פחות חסד קטן) ואינו לפני מועד החיתוך
 * (cutoffAt – תחילת ההדלקה; עסקאות היסטוריות לעולם לא מתאימות). strong = מזהה הבקשה בהערה; weak = טלפון זהה או מייל זהה.
 */
export function findCandidates(p: OpenPaymentForMatch, txs: TxForMatch[], cutoffAt: Date | null = null): { strong: TxForMatch[]; weak: TxForMatch[] } {
  const strong: TxForMatch[] = [];
  const weak: TxForMatch[] = [];
  const notBefore = Math.max(p.createdAt.getTime() - MATCH_EARLY_GRACE_MS, cutoffAt?.getTime() ?? 0);
  const pPhone = phoneDigits(p.phone);
  const pEmail = emailKey(p.email);
  for (const t of txs) {
    if (t.matchedPaymentId !== null) continue;
    if (!t.approved || !t.transactionAt) continue;
    if (t.amount <= 0 || t.amount !== p.amount || !isIls(t.currency)) continue;
    if (t.transactionAt.getTime() < notBefore) continue;
    if (extractReference(t.comments) === p.reference) {
      strong.push(t);
      continue;
    }
    const phoneOk = !!pPhone && pPhone.length >= 9 && t.phone === pPhone;
    const emailOk = !!pEmail && pEmail.includes("@") && t.email === pEmail;
    if (phoneOk || emailOk) weak.push(t);
  }
  return { strong, weak };
}

export type AutoMatch = { paymentId: number; tx: TxForMatch; kind: "strong" };
export type ReviewItem = { paymentId: number; reason: string; transactionIds: string[] };

/**
 * ההחלטה הגלובלית: רק התאמה strong חד-משמעית (בדיוק עסקה אחת עם מזהה הבקשה, שלא נתפסה לבקשה אחרת) משדרגת אוטומטית.
 * כל השאר → review ("ממתין לאישור ידני") עם מספרי העסקאות המועמדות: כמה strong; או weak (טלפון/מייל + סכום – החלטה L4: לא
 * משדרגים אוטומטית, כי טלפון/מייל ניתנים להזנה ע"י כל אחת בדף של נדרים ושתי מורות מאותו טלפון/מוסד הן תרחיש אמיתי; ההערה
 * הנעולה בקישור שלנו מכסה את המסלול הרגיל). אותה עסקה לעולם לא מוקצית לשתי בקשות.
 */
export function decideAutoMatches(payments: OpenPaymentForMatch[], txs: TxForMatch[], cutoffAt: Date | null = null): { matches: AutoMatch[]; review: ReviewItem[] } {
  const matches: AutoMatch[] = [];
  const review: ReviewItem[] = [];
  const taken = new Set<string>();
  const cands = new Map<number, ReturnType<typeof findCandidates>>();
  for (const p of payments) cands.set(p.id, findCandidates(p, txs, cutoffAt));
  // עסקה strong שמופיעה בשתי בקשות (לא אמור לקרות – reference ייחודי) → אף אחת לא נתפסת
  const strongClaimers = new Map<string, number>();
  for (const p of payments) for (const t of cands.get(p.id)!.strong) strongClaimers.set(t.transactionId, (strongClaimers.get(t.transactionId) ?? 0) + 1);

  for (const p of payments) {
    const c = cands.get(p.id)!;
    if (c.strong.length === 1 && strongClaimers.get(c.strong[0].transactionId) === 1 && !taken.has(c.strong[0].transactionId)) {
      taken.add(c.strong[0].transactionId);
      matches.push({ paymentId: p.id, tx: c.strong[0], kind: "strong" });
    } else if (c.strong.length > 0) {
      review.push({ paymentId: p.id, reason: c.strong.length > 1 ? `נמצאו ${c.strong.length} עסקאות עם מזהה הבקשה` : "העסקה עם מזהה הבקשה מתאימה גם לבקשה אחרת", transactionIds: c.strong.map((t) => t.transactionId) });
    } else if (c.weak.length > 0) {
      review.push({ paymentId: p.id, reason: `נמצאה עסקה בסכום הזה עם הטלפון/המייל של המורה אבל בלי מזהה הבקשה – לאישור ידני`, transactionIds: c.weak.map((t) => t.transactionId) });
    }
  }
  return { matches, review };
}

/**
 * אישור ידני עם מספר עסקה שקיים במטמון (M1): העסקה חייבת להיות מאושרת, בסכום זהה לבקשה, חיובית, בש"ח. כל סטייה → סירוב
 * (אלא אם המנהלת מאשרת במפורש "חריג", והסכומים נרשמים באודיט).
 */
export function checkManualTransaction(
  intent: { amount: number },
  tx: Pick<NormalizedTx, "amount" | "currency" | "approved" | "confirmation">,
): { ok: boolean; reason: string } {
  if (!tx.approved) return { ok: false, reason: `לעסקה אין מספר אישור / הסטטוס שלה אינו הצלחה` };
  if (tx.amount <= 0) return { ok: false, reason: `סכום העסקה אינו חיובי (${agorotToAmountString(tx.amount)})` };
  if (!isIls(tx.currency)) return { ok: false, reason: `מטבע העסקה אינו ש"ח (${tx.currency})` };
  if (tx.amount !== intent.amount) return { ok: false, reason: `סכום העסקה (₪${agorotToAmountString(tx.amount)}) שונה מסכום הבקשה (₪${agorotToAmountString(intent.amount)})` };
  return { ok: true, reason: "" };
}

/**
 * סדר ההשלמה (M2/M5) – החלטה טהורה שנבדקת ביחידה:
 *   couponClaimed=false (יש קופון ולא נתפס) → wait: הבקשה חוזרת ל-processing לאישור ידני, בלי מנוי.
 *   existingPurchaseId → skip_insert: המנוי כבר נוצר בניסיון קודם – רק לסמן paid, לא להכניס שורות שוב.
 *   אחרת → insert.
 * וכלל הברזל אחרי ש-purchases נכנסו: כל כישלון מאוחר (תנועה כספית, קופון, מייל) משאיר paid + אירוע error – לא חוזרים אחורה.
 */
export function settlementPlan(input: { hasCoupon: boolean; couponClaimed: boolean; existingPurchaseId: number | null }): "wait_coupon" | "skip_insert" | "insert" {
  if (input.hasCoupon && !input.couponClaimed) return "wait_coupon";
  if (input.existingPurchaseId) return "skip_insert";
  return "insert";
}
export const KEEP_PAID_AFTER_INSERT = true;

// ---------------------------------------------------------------------------------------------------------------- CallBack (אופציונלי)

/** גוף ה-CallBack של נדרים: form-urlencoded (ברירת המחדל של ASP.NET) או JSON. מחזיר אובייקט שטוח, או {} אם ריק */
export function parseCallbackBody(contentType: string | null | undefined, text: string | null | undefined): Record<string, unknown> {
  const ct = String(contentType ?? "").toLowerCase();
  const t = String(text ?? "");
  if (!t.trim()) return {};
  if (ct.includes("json") || /^\s*[{[]/.test(t)) {
    try {
      const j: unknown = JSON.parse(t);
      if (j && typeof j === "object" && !Array.isArray(j)) return j as Record<string, unknown>;
    } catch {
      /* ננסה כ-form */
    }
  }
  const out: Record<string, unknown> = {};
  try {
    for (const [k, v] of new URLSearchParams(t)) out[k] = v;
  } catch {
    /* ריק */
  }
  return out;
}

/** השדות שמעניינים אותנו מ-CallBack (לא מתועד – סובלני לשמות). רק לרישום ביומן ולהפעלת רענון; לא להשלמה. */
export function extractCallbackFields(obj: unknown): { reference: string | null; transactionId: string | null; amount: number | null } {
  return {
    reference: extractReference(pick(obj, ["Param1"])) || extractReference(pick(obj, ["Comment", "Comments", "Avour"])) || null,
    transactionId: pick(obj, ["TransactionId", "TransactionID", "Id"])?.slice(0, 40) ?? null,
    amount: shekelsToAgorot(pick(obj, ["Amount", "Sum", "Schum"])),
  };
}

// ---------------------------------------------------------------------------------------------------------------- טקסטים

/** הטקסט שהמורה רואה לפי הסטטוס – פנייה בלשון נוכחת. stale = processing מעל 48 שעות (N10) */
export function customerStatusText(status: string, assistRequested = false, stale = false): string {
  switch (status) {
    case "paid":
      return "התשלום זוהה והמנוי שלך פעיל. תודה!";
    case "processing":
      if (stale) return "הבקשה ממתינה לטיפול המנהלת כבר יותר מיומיים. אם שילמת – אין צורך לשלם שוב; כתבי לנו ונסדיר את זה.";
      return assistRequested
        ? "הבקשה שלך הועברה למנהלת האתר – היא תיצור איתך קשר להשלמת התשלום. אין צורך לשלם שוב."
        : "התשלום התקבל אצל נדרים פלוס אבל לא הצלחנו לשייך אותו אוטומטית – מנהלת האתר תאשר אותו ידנית. אין צורך לשלם שוב.";
    case "failed":
      return "התשלום לא אושר. אפשר לנסות שוב, או לפנות אלינו.";
    case "cancelled":
      return "הבקשה בוטלה.";
    case "expired":
      return "הבקשה פגה. אפשר להתחיל תשלום חדש.";
    default:
      return assistRequested
        ? "הבקשה שלך הועברה למנהלת האתר – היא תיצור איתך קשר להשלמת התשלום."
        : "ממתינים לאישור התשלום מנדרים פלוס. הבדיקה מתבצעת פעם בכמה דקות – אפשר להשאיר את הדף פתוח, או לחזור אחר כך לאזור האישי.";
  }
}

export const STATUS_LABEL_HE: Record<NedarimStatus, string> = {
  pending: "ממתין לתשלום",
  processing: "ממתין לאישור ידני",
  paid: "שולם",
  failed: "נכשל",
  expired: "פג תוקף",
  cancelled: "בוטל",
};

export const VERIFY_LABEL_HE: Record<VerifyMethod, string> = {
  api: "הותאם לעסקה בנדרים פלוס",
  manual: "אושר ידנית",
  simulated: "סימולציה (פיתוח)",
};
