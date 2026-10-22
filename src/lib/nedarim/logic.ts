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

/** תאריך כפי שנדרים מחזירים (TransactionTime): ISO, או dd/MM/yyyy HH:mm[:ss]. null אם לא ניתן לפענח. */
export function parseNedarimDate(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
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
  transactionAt: Date | null;
};

/**
 * שורה מ-GetHistoryJson → מבנה מנורמל. שמות השדות לפי תיעוד ה-API של נדרים (TransactionId, Amount, Currency, Phone, Mail,
 * Comments, TransactionTime, ClientName, Confirmation, LastNum) עם סובלנות לשמות קרובים. null = אין מזהה עסקה.
 */
export function parseHistoryRow(row: unknown): NormalizedTx | null {
  const id = pick(row, ["TransactionId", "TransactionID", "Id"]);
  if (!id || !/^\d{1,30}$/.test(id.trim())) return null;
  const amount = shekelsToAgorot(pick(row, ["Amount", "Sum", "Schum"]));
  if (amount === null) return null;
  return {
    transactionId: id.trim(),
    amount,
    currency: pick(row, ["Currency"]) ?? null,
    phone: phoneDigits(pick(row, ["Phone", "Cellular", "Phone1", "Tel"])),
    email: emailKey(pick(row, ["Mail", "Email"])),
    clientName: pick(row, ["ClientName", "Name", "FullName"])?.slice(0, 120) ?? null,
    comments: pick(row, ["Comments", "Comment", "Avour", "Param1"])?.slice(0, 500) ?? null,
    confirmation: pick(row, ["Confirmation", "ConfirmationNumber"])?.slice(0, 40) ?? null,
    last4: (pick(row, ["LastNum", "Last4", "CardLast4"]) ?? "").replace(/\D/g, "").slice(-4) || null,
    transactionAt: parseNedarimDate(pick(row, ["TransactionTime", "Date", "CreateDate", "Time"])),
  };
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
 * מועמדות להתאמה לבקשה: סכום זהה בדיוק, ש"ח, לא משויכת, ומועד העסקה (או מועד הקריאה אם אין) לא לפני יצירת הבקשה (פחות
 * חסד קטן). strong = מזהה הבקשה מופיע בהערת העסקה; weak = טלפון זהה או מייל זהה (שניהם לא ריקים).
 */
export function findCandidates(p: OpenPaymentForMatch, txs: TxForMatch[]): { strong: TxForMatch[]; weak: TxForMatch[] } {
  const strong: TxForMatch[] = [];
  const weak: TxForMatch[] = [];
  const notBefore = p.createdAt.getTime() - MATCH_EARLY_GRACE_MS;
  const pPhone = phoneDigits(p.phone);
  const pEmail = emailKey(p.email);
  for (const t of txs) {
    if (t.matchedPaymentId !== null) continue;
    if (t.amount <= 0 || t.amount !== p.amount || !isIls(t.currency)) continue;
    const when = (t.transactionAt ?? t.fetchedAt).getTime();
    if (when < notBefore) continue;
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

export type AutoMatch = { paymentId: number; tx: TxForMatch; kind: "strong" | "weak" };

/**
 * ההחלטה הגלובלית: אילו בקשות משודרגות אוטומטית ואילו "לא בטוח – אישור ידני".
 *   strong: בדיוק עסקה אחת עם מזהה הבקשה → התאמה. יותר מאחת → ambiguous.
 *   weak (רק לבקשות בלי strong): עסקה אחת בדיוק שמתאימה לבקשה, ואותה עסקה לא מתאימה לשום בקשה פתוחה אחרת → התאמה; אחרת ambiguous.
 * אותה עסקה לעולם לא מוקצית לשתי בקשות.
 */
export function decideAutoMatches(payments: OpenPaymentForMatch[], txs: TxForMatch[]): { matches: AutoMatch[]; ambiguous: { paymentId: number; reason: string }[] } {
  const matches: AutoMatch[] = [];
  const ambiguous: { paymentId: number; reason: string }[] = [];
  const taken = new Set<string>();
  const cands = new Map<number, ReturnType<typeof findCandidates>>();
  for (const p of payments) cands.set(p.id, findCandidates(p, txs));

  // strong first
  for (const p of payments) {
    const c = cands.get(p.id)!;
    if (c.strong.length === 1 && !taken.has(c.strong[0].transactionId)) {
      taken.add(c.strong[0].transactionId);
      matches.push({ paymentId: p.id, tx: c.strong[0], kind: "strong" });
    } else if (c.strong.length > 1) {
      ambiguous.push({ paymentId: p.id, reason: `נמצאו ${c.strong.length} עסקאות עם מזהה הבקשה` });
    }
  }
  const decided = new Set([...matches.map((m) => m.paymentId), ...ambiguous.map((a) => a.paymentId)]);
  // weak: מי עוד "טוענת" לאותה עסקה
  const claimers = new Map<string, number[]>();
  for (const p of payments) {
    if (decided.has(p.id)) continue;
    for (const t of cands.get(p.id)!.weak) claimers.set(t.transactionId, [...(claimers.get(t.transactionId) ?? []), p.id]);
  }
  for (const p of payments) {
    if (decided.has(p.id)) continue;
    const weak = cands.get(p.id)!.weak.filter((t) => !taken.has(t.transactionId));
    if (weak.length === 0) continue;
    if (weak.length === 1 && (claimers.get(weak[0].transactionId) ?? []).length === 1) {
      taken.add(weak[0].transactionId);
      matches.push({ paymentId: p.id, tx: weak[0], kind: "weak" });
    } else {
      ambiguous.push({ paymentId: p.id, reason: weak.length > 1 ? `נמצאו ${weak.length} עסקאות בסכום הזה עם הטלפון/המייל של המורה` : "העסקה מתאימה גם לבקשה פתוחה אחרת" });
    }
  }
  return { matches, ambiguous };
}

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

/** הטקסט שהמורה רואה לפי הסטטוס – פנייה בלשון נוכחת */
export function customerStatusText(status: string, assistRequested = false): string {
  switch (status) {
    case "paid":
      return "התשלום זוהה והמנוי שלך פעיל. תודה!";
    case "processing":
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
