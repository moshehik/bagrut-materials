/**
 * הלוגיקה הטהורה של התשלום דרך נדרים פלוס – בלי imports, בלי DB, בלי React: נטענת בשרת (api/pay/*, store.ts),
 * בדפדפן (components/pay/pay-client.tsx) ובבדיקות (scripts/nedarim-tests/logic.test.ts). תיעוד: docs/nedarim-payments.md.
 *
 * מקור הפרוטוקול: הדוגמה הרשמית של נדרים פלוס https://www.matara.pro/nedarimplus/iframe/sample2.html והקוד של ה-iframe עצמו
 * (https://matara.pro/nedarimplus/iframe): ההורה שולח postMessage {Name:'FinishTransaction2', Value:{...}} ומקבל
 * {Name:'Height'|'TransactionResponse'|'ValidateFields'}. מספר הכרטיס, התוקף וה-CVV מוקלדים אך ורק בתוך ה-iframe (matara.pro) –
 * לעולם לא עוברים דרך השרת שלנו. הערה מהדוגמה: postMessage ל-iframe לא עובד מ-localhost – רק מדומיין אמיתי.
 */

export const NEDARIM_IFRAME_URL = "https://matara.pro/nedarimplus/iframe";
/** מקורות שמהם מותר לקבל postMessage (ה-iframe עונה ל-event.origin של ההורה; אנחנו בודקים את המקור שלו) */
export const NEDARIM_ORIGINS: readonly string[] = ["https://matara.pro", "https://www.matara.pro"];

export const NEDARIM_STATUSES = ["pending", "processing", "paid", "failed", "expired", "cancelled"] as const;
export type NedarimStatus = (typeof NEDARIM_STATUSES)[number];
/** סטטוסים שבהם הבקשה עדיין "חיה" ויכולה להפוך ל-paid */
export const OPEN_STATUSES: readonly NedarimStatus[] = ["pending", "processing"];
export const isNedarimStatus = (s: unknown): s is NedarimStatus =>
  typeof s === "string" && (NEDARIM_STATUSES as readonly string[]).includes(s);

export type VerifyMethod = "api" | "callback" | "manual" | "simulated";

/** המסלולים שנמכרים דרך /pay (המסלולים החודשיים הישנים הוסרו – ר' RETIRED_PLANS ב-constants) */
export const PAYABLE_PLANS = ["yearly", "substitute_3m", "substitute_daily"] as const;
export type PayablePlan = (typeof PAYABLE_PLANS)[number];
export const isPayablePlan = (p: unknown): p is PayablePlan =>
  typeof p === "string" && (PAYABLE_PLANS as readonly string[]).includes(p);

export const REFERENCE_PREFIX = "NP-";
export const REFERENCE_RE = /^NP-[A-HJ-NP-Z2-9]{8}$/; // בלי I/O/0/1 (קריא בטלפון)
const REFERENCE_IN_TEXT_RE = /NP-[A-HJ-NP-Z2-9]{8}/;
export const MAX_BODY_BYTES = 8 * 1024;
/** בקשה 'pending' ישנה מזה נחשבת פגת תוקף (ניקוי במסך הניהול) */
export const INTENT_TTL_HOURS = 48;
/** כמה זמן מחכים להודעת Height מה-iframe לפני שמציעים את החלופה (נטפרי / חסימה) */
export const FRAME_LOAD_TIMEOUT_MS = 12_000;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** מזהה בקשה חדש NP-XXXXXXXX. randomBytes(n) → מערך בתים באורך n (crypto.randomBytes בשרת). */
export function generateReference(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(8);
  let out = REFERENCE_PREFIX;
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const isValidReference = (s: unknown): s is string => typeof s === "string" && REFERENCE_RE.test(s);

/** מוצא מזהה בקשה בתוך טקסט חופשי (Param1 / Comment שנדרים מחזירים) – או null */
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

// ---------------------------------------------------------------------------------------------------------------- ה-iframe

export type FinishTransactionValue = {
  Mosad: string;
  ApiValid: string;
  PaymentType: string;
  Currency: string;
  Zeout: string;
  FirstName: string;
  LastName: string;
  Street: string;
  City: string;
  Phone: string;
  Mail: string;
  Amount: string;
  Tashlumim: string;
  Groupe: string;
  Comment: string;
  Param1: string;
  Param2: string;
  ForceUpdateMatching: string;
  CallBack: string;
  CallBackMailError: string;
};

/**
 * הערך של ההודעה FinishTransaction2 להורה של ה-iframe – בדיוק השדות שהדוגמה הרשמית (sample2.html) שולחת, בלי Tokef
 * (התוקף מוקלד בתוך ה-iframe). אין כאן פרמטרים מומצאים.
 */
export function buildFinishTransactionValue(input: {
  mosad: string;
  apiValid: string;
  reference: string;
  amountAgorot: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city?: string | null;
  comment: string;
  callbackUrl: string;
  /** Param2 – מה נרכש (למשל "yearly"), חוזר ב-CallBack */
  param2?: string;
}): FinishTransactionValue {
  return {
    Mosad: String(input.mosad ?? ""),
    ApiValid: String(input.apiValid ?? ""),
    PaymentType: "Ragil", // חיוב חד-פעמי (לא הו"ק ולא טוקן)
    Currency: "1", // ש"ח
    Zeout: "", // ת.ז מוקלדת ב-iframe אם נדרים דורשים
    FirstName: String(input.firstName ?? ""),
    LastName: String(input.lastName ?? ""),
    Street: "",
    City: String(input.city ?? ""),
    Phone: String(input.phone ?? ""),
    Mail: String(input.email ?? ""),
    Amount: agorotToAmountString(input.amountAgorot),
    Tashlumim: "1",
    Groupe: "",
    Comment: String(input.comment ?? "").slice(0, 200),
    Param1: String(input.reference ?? ""), // מזהה הבקשה שלנו – חוזר ב-CallBack
    Param2: String(input.param2 ?? ""),
    ForceUpdateMatching: "",
    CallBack: String(input.callbackUrl ?? ""),
    CallBackMailError: "",
  };
}

/** הערת העסקה שרואים בפורטל של נדרים: שם האתר + המסלול + מזהה הבקשה (כדי שאפשר יהיה לאתר אותה גם בלי Param1) */
export function buildTransactionComment(siteName: string, planLabel: string, reference: string): string {
  return [siteName.trim(), planLabel.trim(), reference].filter(Boolean).join(" - ").slice(0, 200);
}

/** TransactionResponse.Value שה-iframe מחזיר: הצלחה = Status 'OK' (ה-iframe עצמו מתייחס לכל דבר שאינו 'Error' כהצלחה; אנחנו קפדניים) */
export function isTransactionOk(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return String((value as Record<string, unknown>).Status ?? "")
    .trim()
    .toUpperCase() === "OK";
}

// ---------------------------------------------------------------------------------------------------------------- CallBack ואימות

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

export type TransactionFields = {
  reference: string | null;
  transactionId: string | null;
  /** באגורות */
  amount: number | null;
  status: string | null;
  /** true/false לפי Status, null אם אין שדה Status */
  ok: boolean | null;
  confirmation: string | null;
  last4: string | null;
  message: string | null;
};

/**
 * מחלץ את השדות שמעניינים אותנו מתשובת נדרים (CallBack או TransactionResponse) בסובלנות לשמות. השדות המדויקים של ה-CallBack
 * אינם מתועדים בדוגמאות הפומביות – ולכן הגוף הגולמי נשמר תמיד (nedarim_payments.callback_body) והאימות המחייב נעשה מול ה-API
 * (matchHistoryRow), לא מול הגוף הזה.
 */
export function extractTransactionFields(obj: unknown): TransactionFields {
  const reference =
    extractReference(pick(obj, ["Param1"])) || extractReference(pick(obj, ["Comment", "Comments", "Avour"])) || null;
  const amount = shekelsToAgorot(pick(obj, ["Amount", "Sum", "Schum"]));
  const statusRaw = pick(obj, ["Status"]);
  const status = statusRaw ? statusRaw.trim().toUpperCase() : null;
  return {
    reference,
    transactionId: pick(obj, ["TransactionId", "TransactionID", "Id"])?.slice(0, 40) ?? null,
    amount: amount && amount > 0 ? amount : null,
    status,
    ok: status ? status === "OK" : null,
    confirmation: pick(obj, ["Confirmation", "ConfirmationNumber", "AuthorisationNumber"])?.slice(0, 40) ?? null,
    last4: (pick(obj, ["LastNum", "Last4", "CardLast4"]) ?? "").replace(/\D/g, "").slice(-4) || null,
    message: pick(obj, ["Message", "ErrorMessage", "BackMessage"])?.slice(0, 500) ?? null,
  };
}

export type HistoryRow = Record<string, unknown>;

/**
 * מוצא בהיסטוריית העסקאות של המוסד (Manage3 GetHistoryJson) את העסקה של הבקשה. התאמה: TransactionId שווה (אם ידוע) + סכום שווה
 * + מטבע ש"ח; בלי TransactionId – לפי מזהה הבקשה בהערות (Comments) + סכום. שמות השדות (TransactionId/Amount/Currency/Comments)
 * לפי המסמך של נדרים כפי שהובן בגמ"ח – לא אומתו מול תשובה אמיתית (ר' docs/nedarim-payments.md, "מה חסר").
 */
export function matchHistoryRow(
  rows: unknown,
  want: { transactionId: string | null; amountAgorot: number; reference: string },
): { matched: boolean; row: HistoryRow | null; reason: string } {
  const list: HistoryRow[] = Array.isArray(rows) ? rows.filter((r): r is HistoryRow => !!r && typeof r === "object") : [];
  const sameAmount = (r: HistoryRow) => {
    const a = shekelsToAgorot(pick(r, ["Amount", "Sum", "Schum"]));
    return a !== null && Math.abs(a - want.amountAgorot) <= 1;
  };
  const ils = (r: HistoryRow) => {
    const c = pick(r, ["Currency"]);
    return c === undefined || c === "1" || c.includes("₪") || /ils|nis|ש"ח|שח/i.test(c);
  };
  if (want.transactionId) {
    const row = list.find((r) => pick(r, ["TransactionId", "TransactionID", "Id"]) === String(want.transactionId));
    if (!row) return { matched: false, row: null, reason: "העסקה לא נמצאה בהיסטוריה של המוסד" };
    if (!sameAmount(row)) {
      return {
        matched: false,
        row,
        reason: `סכום העסקה (${pick(row, ["Amount"]) ?? "?"}) שונה מהסכום שהתבקש (${agorotToAmountString(want.amountAgorot)})`,
      };
    }
    if (!ils(row)) return { matched: false, row, reason: 'מטבע העסקה אינו ש"ח' };
    return { matched: true, row, reason: "" };
  }
  const ref = want.reference.toUpperCase();
  const byComment = list.filter((r) =>
    String(pick(r, ["Comments", "Comment", "Param1"]) ?? "")
      .toUpperCase()
      .includes(ref),
  );
  if (byComment.length === 0) return { matched: false, row: null, reason: "לא נמצאה עסקה עם מזהה הבקשה בהערות" };
  const row = byComment.find((r) => sameAmount(r) && ils(r));
  if (!row) return { matched: false, row: byComment[0], reason: "נמצאה עסקה עם מזהה הבקשה אבל בסכום/מטבע אחר" };
  return { matched: true, row, reason: "" };
}

export type SettlementDecision = {
  action: "settle" | "wait" | "fail" | "noop";
  verified: boolean;
  method: VerifyMethod | null;
  reason: string;
};

/**
 * ההחלטה אם להשלים את התשלום ואיך לסמן אותו.
 *   intent: { status, amount }; api: תוצאת האימות מול ההיסטוריה (null = לא נוסה);
 *   report: מה שדווח (CallBack או דפדפן); trustCallback: NEDARIM_TRUST_CALLBACK; simulated: מצב דמה (פיתוח בלבד).
 */
export function decideSettlement(input: {
  intent: { status: string; amount: number } | null;
  api: { available: boolean; matched: boolean; reason: string } | null;
  report: { ok: boolean | null; amount: number | null; fromCallback: boolean; message?: string | null } | null;
  trustCallback?: boolean;
  simulated?: boolean;
}): SettlementDecision {
  const { intent, api, report, trustCallback = false, simulated = false } = input;
  if (!intent) return { action: "noop", verified: false, method: null, reason: "אין בקשה" };
  if (intent.status === "paid") return { action: "noop", verified: true, method: null, reason: "כבר הושלם" };
  if (intent.status === "cancelled" || intent.status === "expired") {
    return { action: "noop", verified: false, method: null, reason: "הבקשה בוטלה / פגה" };
  }
  if (simulated) return { action: "settle", verified: false, method: "simulated", reason: "מצב דמה (פיתוח בלבד)" };
  if (api && api.available) {
    if (api.matched) return { action: "settle", verified: true, method: "api", reason: "" };
    return { action: "wait", verified: false, method: null, reason: api.reason || "לא אומת מול נדרים פלוס" };
  }
  if (report && report.ok === false) {
    return { action: "fail", verified: false, method: null, reason: report.message || "נדרים פלוס דיווחו על כישלון" };
  }
  const amountOk = !!report && (report.amount === null || Math.abs(report.amount - intent.amount) <= 1);
  if (report && report.ok && report.fromCallback && trustCallback && amountOk) {
    return { action: "settle", verified: false, method: "callback", reason: "אושר לפי CallBack (בלי אימות API)" };
  }
  if (report && report.ok) {
    return { action: "wait", verified: false, method: null, reason: "ממתין לאימות מול נדרים פלוס (אין מפתח API / האימות לא הצליח)" };
  }
  return { action: "noop", verified: false, method: null, reason: "אין דיווח הצלחה" };
}

/** הטקסט שהמורה רואה לפי הסטטוס (עמוד התשלום / בדיקת סטטוס) – פנייה בלשון נוכחת */
export function customerStatusText(status: string, assistRequested = false): string {
  switch (status) {
    case "paid":
      return "התשלום התקבל והמנוי שלך פעיל. תודה!";
    case "processing":
      return assistRequested
        ? "הבקשה שלך הועברה למנהלת האתר – היא תיצור איתך קשר להשלמת התשלום. אין צורך לשלם שוב."
        : "התשלום התקבל ונמצא באימות מול חברת הסליקה. המנוי יופעל אוטומטית בסיום האימות – אין צורך לשלם שוב.";
    case "failed":
      return "התשלום לא אושר. אפשר לנסות שוב, או לפנות אלינו.";
    case "cancelled":
      return "הבקשה בוטלה.";
    case "expired":
      return "הבקשה פגה. אפשר להתחיל תשלום חדש.";
    default:
      return assistRequested
        ? "הבקשה שלך הועברה למנהלת האתר – היא תיצור איתך קשר להשלמת התשלום."
        : "ממתין להשלמת התשלום.";
  }
}

export const STATUS_LABEL_HE: Record<NedarimStatus, string> = {
  pending: "ממתין לתשלום",
  processing: "ממתין לאימות",
  paid: "שולם",
  failed: "נכשל",
  expired: "פג תוקף",
  cancelled: "בוטל",
};

export const VERIFY_LABEL_HE: Record<VerifyMethod, string> = {
  api: "אומת מול נדרים פלוס",
  callback: "לפי CallBack (ללא אימות API)",
  manual: "אושר ידנית",
  simulated: "סימולציה (פיתוח)",
};
