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

/** api = הותאם לפי מזהה הבקשה בהערה; api_weak = הותאם לפי טלפון/מייל + סכום (ייחודי); manual = המנהלת; simulated = מצב דמה */
export type VerifyMethod = "api" | "api_weak" | "manual" | "simulated";

/** המסלולים שנמכרים דרך /pay (המסלולים החודשיים הישנים הוסרו – ר' RETIRED_PLANS ב-constants) */
export const PAYABLE_PLANS = ["yearly", "substitute_3m", "substitute_daily"] as const;
export type PayablePlan = (typeof PAYABLE_PLANS)[number];
export const isPayablePlan = (p: unknown): p is PayablePlan =>
  typeof p === "string" && (PAYABLE_PLANS as readonly string[]).includes(p);

/**
 * שמות הקטגוריות ב-Nedarim Plus (נוצרו במוסד דרך SaveEditGroupe) – הקישור מעביר את השם כ-`groupe`, כך
 * שהעסקה והדוחות שלהם מסווגים לפי המסלול. הזיהוי עצמו לא נשען על זה (ר' Analytic).
 */
export const PLAN_GROUPE_NAMES: Record<PayablePlan, string> = {
  yearly: "מנוי שנתי",
  substitute_3m: "ממלאת מקום 3 חודשים",
  substitute_daily: "ממלאת מקום יומית",
};

/**
 * רכישות פריט בודד דרך /pay (בנוסף למסלולי המנוי): "single" = הורדה בודדת של חומר אחד (מחיר = materials.price),
 * "bundle" = קובץ מורחב – תיקייה שלמה (מחיר = bundleAmountFor). אותן שורות purchases שהקופה הישנה יצרה (itemPurchaseRow).
 */
export const PAYABLE_ITEM_KINDS = ["single", "bundle"] as const;
export type PayableItemKind = (typeof PAYABLE_ITEM_KINDS)[number];
export const isPayableItemKind = (p: unknown): p is PayableItemKind =>
  typeof p === "string" && (PAYABLE_ITEM_KINDS as readonly string[]).includes(p);
/** כל מה שנמכר דרך /pay: מסלול מנוי או פריט */
export type PayKey = PayablePlan | PayableItemKind;
export const PAY_KEYS = [...PAYABLE_PLANS, ...PAYABLE_ITEM_KINDS] as const;
export const isPayKey = (p: unknown): p is PayKey => isPayablePlan(p) || isPayableItemKind(p);
/** "plan" = מסלול מנוי; אחרת סוג הפריט – לטקסטים ולהחלטות שתלויות בסוג ההזמנה */
export const orderKindOf = (plan: string): "plan" | PayableItemKind => (isPayableItemKind(plan) ? plan : "plan");

/** שמות הקטגוריות בנדרים לרכישות פריט (לדוחות – כמו PLAN_GROUPE_NAMES; המחיר משתנה, אז בלי סכום מינימלי) */
export const ITEM_GROUPE_NAMES: Record<PayableItemKind, string> = {
  single: "הורדה בודדת",
  bundle: "קובץ מורחב",
};
export const GROUPE_NAMES: Record<PayKey, string> = { ...PLAN_GROUPE_NAMES, ...ITEM_GROUPE_NAMES };
/** שם הקטגוריה בנדרים למפתח ההזמנה; מפתח לא מוכר מועבר כפי שהוא (לדוחות בלבד – לא לזיהוי) */
export const groupeNameFor = (key: string): string => (isPayKey(key) ? GROUPE_NAMES[key] : key);

// ---------------------------------------------------------------------------------------------------------------- תנאי תשלום: תשלומים / הוראת קבע

/**
 * normal = עסקת אשראי רגילה: החיוב מלא על מסגרת הכרטיס, מפוצל ל-N תשלומים (נדרים: `Payment` בדף המתארח, `Tashloumim` בהיסטוריה;
 *          `Amount` בהיסטוריה = הסכום המלא, שורה אחת).
 * keva   = הוראת קבע באשראי (`OnlyKeva=1`): חיוב חודשי קבוע, **בלי תפיסת מסגרת**; `Amount` בדף = סכום החיוב החודשי, `Payment` = כמה
 *          חודשים; בהיסטוריה כל חיוב הוא שורה נפרדת בסכום החודשי עם `KevaId` (תיעוד נדרים, "דף תשלום – קישור ישיר").
 */
export const CHARGE_MODES = ["normal", "keva"] as const;
export type ChargeMode = (typeof CHARGE_MODES)[number];
export const isChargeMode = (m: unknown): m is ChargeMode => m === "normal" || m === "keva";

/** כמה תשלומים/חיובים לכל מסלול. keva=null: אין הוראת קבע למסלול (יומית ופריטים – תשלום אחד בלבד). שנתי: 12 תשלומים (החלטת הבעלים 28.10.2026 – לא תשלום אחד); ממלאת מקום 3 חודשים: 3. */
export const PAYMENT_TERMS: Record<PayKey, { normal: number; keva: number | null }> = {
  yearly: { normal: 12, keva: 12 },
  substitute_3m: { normal: 3, keva: 3 },
  substitute_daily: { normal: 1, keva: null },
  single: { normal: 1, keva: null },
  bundle: { normal: 1, keva: null },
};
/** מינימום נדרים לכל תשלום בעסקת תשלומים / חיוב בהוראת קבע (5 ₪) */
export const MIN_CHARGE_AGOROT = 500;

export type ChargeTerms = {
  mode: ChargeMode;
  /** מספר התשלומים (normal) / מספר החיובים החודשיים (keva) */
  installments: number;
  /** הסכום שיופיע ב-`Amount` של העסקה בהיסטוריית נדרים: normal = הסכום המלא; keva = החיוב החודשי */
  chargeAmount: number;
  /** סך כל מה שהמורה משלמת (אגורות) */
  total: number;
};

/**
 * התנאים למסלול ולמצב תשלום, או null אם המצב אינו זמין: הו"ק רק למסלולים שמגדירים אותה ורק כשהסכום (אחרי קופון) מתחלק בשווה
 * באגורות וכל חיוב ≥ 5 ₪ (הסכום נעול – אין עיגול כלפי מעלה/מטה). normal: אם הסכום קטן מכדי לפצל (<5 ₪ לתשלום) – תשלום אחד.
 */
export function chargeTermsFor(plan: string, mode: ChargeMode, totalAgorot: number): ChargeTerms | null {
  if (!Number.isSafeInteger(totalAgorot) || totalAgorot <= 0) return null;
  const t = isPayKey(plan) ? PAYMENT_TERMS[plan] : { normal: 1, keva: null };
  if (mode === "keva") {
    const n = t.keva;
    if (!n || n < 2 || totalAgorot % n !== 0) return null;
    const monthly = totalAgorot / n;
    return monthly >= MIN_CHARGE_AGOROT ? { mode, installments: n, chargeAmount: monthly, total: totalAgorot } : null;
  }
  const n = totalAgorot >= t.normal * MIN_CHARGE_AGOROT ? t.normal : 1;
  return { mode, installments: n, chargeAmount: totalAgorot, total: totalAgorot };
}

/** התנאים כפי ששמורים על בקשה (עמודות charge_mode / installments / charge_amount; בקשות ישנות = תשלום אחד בסכום המלא) */
export function termsOfPayment(row: { amount: number; chargeMode?: string | null; installments?: number | null; chargeAmount?: number | null }): ChargeTerms {
  const mode: ChargeMode = row.chargeMode === "keva" ? "keva" : "normal";
  const installments = Number.isInteger(row.installments) && (row.installments ?? 0) >= 1 ? (row.installments as number) : 1;
  const chargeAmount = Number.isInteger(row.chargeAmount) && (row.chargeAmount ?? 0) > 0 ? (row.chargeAmount as number) : mode === "keva" && installments > 0 ? Math.round(row.amount / installments) : row.amount;
  return { mode, installments, chargeAmount, total: row.amount };
}

/** תיאור התנאים למורה / למנהלת: "תשלום אחד", "3 תשלומים", "הוראת קבע – 12 חיובים חודשיים של ₪49" */
export function describeTerms(terms: ChargeTerms): string {
  if (terms.mode === "keva") return `הוראת קבע – ${terms.installments} חיובים חודשיים של ₪${agorotToAmountString(terms.chargeAmount)}`;
  return terms.installments <= 1 ? "תשלום אחד" : `${terms.installments} תשלומים`;
}

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
 * הקישור לדף התשלום המתארח של נדרים פלוס – לפי מה שנבדק **בפועל** מול הדף ומול GetHistoryJson (22.10.2026):
 *   mosad (חובה); Amount + AmountLock=1 – נשמר (Amount "1" הגיע כ-"1"); **Analytic=<NP-…> – הזיהוי המהימן**: נכנס לתחילת
 *   `Comments` של העסקה; avour – נכנס ל-`Comments` אחרי ה-Analytic, מופרד ב-" | " (תיאור קצר, בלי PII); groupe – נכנס לשדה
 *   `Groupe` כפי שהוא (מפתח המסלול לדוחות, לא לזיהוי); Payment/PaymentLock, OnlyNormal, OnlyShekel, Redirect, HideParameters –
 *   לפי קוד הדף. **`comment` לא נכנס לשום שדה – לא נשלח.** ClientName/Phone/Email ממולאים מראש **לא נשמרים בעסקה** – נשמרים
 *   רק הפרטים שהמשלמת עצמה הזינה בטופס; נשלחים בכל זאת (לא מזיק, אולי ממלאים את הטופס), אבל שום דבר לא נשען עליהם.
 * אין בדף פרמטר CallBack ואין Param1/Param2.
 */
export function hostedPaymentUrl(input: {
  mosadId: string;
  amountAgorot: number;
  reference: string;
  clientName: string;
  phone: string;
  email: string;
  /** מפתח ההזמנה (yearly / substitute_3m / substitute_daily / single / bundle) – לשדה Groupe בדוחות נדרים */
  planKey: string;
  /** תיאור קצר (בלי PII) – נכנס ל-Comments אחרי המזהה */
  description: string;
  redirectUrl: string;
  /** normal (ברירת מחדל) = עסקה רגילה ב-`installments` תשלומים; keva = הוראת קבע אשראי של `installments` חיובים חודשיים (בלי תפיסת מסגרת) */
  mode?: ChargeMode;
  installments?: number;
  /** keva: סכום החיוב החודשי (אגורות) – נשלח ב-Amount. normal: לא בשימוש (Amount = amountAgorot, הסכום המלא) */
  chargeAgorot?: number;
}): string {
  const keva = input.mode === "keva";
  const installments = Math.max(1, Math.floor(input.installments ?? 1));
  const q = new URLSearchParams();
  q.set("mosad", input.mosadId);
  // הסכום ומספר התשלומים נעולים בקישור (AmountLock/PaymentLock). בהוראת קבע: Amount = החיוב החודשי, Payment = מספר החודשים
  q.set("Amount", agorotToAmountString(keva ? (input.chargeAgorot ?? Math.round(input.amountAgorot / installments)) : input.amountAgorot));
  q.set("AmountLock", "1");
  q.set("Payment", String(installments));
  q.set("PaymentLock", "1");
  q.set(keva ? "OnlyKeva" : "OnlyNormal", "1");
  q.set("OnlyShekel", "1");
  if (input.clientName) q.set("ClientName", input.clientName.slice(0, 60));
  if (input.phone) q.set("Phone", input.phone.slice(0, 20));
  if (input.email) q.set("Email", input.email.slice(0, 120));
  q.set("Analytic", input.reference);
  if (input.description) q.set("avour", input.description.slice(0, 100));
  // הוראת קבע בקטגוריה נפרדת (שם חופשי, לא קיים ברשימת הקטגוריות): ל-Amount של קטגוריה בנדרים יש תפקיד של *מינימום תרומה*,
  // וחיוב חודשי של ₪49 היה נחסם מול המינימום של "מנוי שנתי" (₪588). גם הדוחות מפרידים בין שני האופנים.
  if (input.planKey) q.set("groupe", `${groupeNameFor(input.planKey)}${keva ? " – הוראת קבע" : ""}`.slice(0, 40));
  if (input.redirectUrl) q.set("Redirect", input.redirectUrl);
  q.set("HideParameters", "1");
  // רווח כ-%20 ולא כ-+: דף נדרים לא מפענח + ושומר אותו כמות שהוא ("לו״ז+העניין+-+מנוי+שנתי" בהערת העסקה); + אמיתי כבר מקודד ל-%2B
  return `${NEDARIM_HOSTED_BASE}?${q.toString().replace(/\+/g, "%20")}`;
}

/**
 * התיאור הקצר שנכנס ל-Comments אחרי המזהה (avour): שם האתר + המסלול (+ שם הפריט ברכישת חומר/תיקייה) – בלי PII.
 * שם של חומר/תיקייה הוא תוכן ציבורי של האתר, לא פרט אישי. נחתך ל-100 תווים (avour).
 */
export function buildTransactionComment(siteName: string, planLabel: string, itemTitle = ""): string {
  const title = itemTitle.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return [siteName.trim(), planLabel.trim(), title].filter(Boolean).join(" - ").slice(0, 100);
}

// ---------------------------------------------------------------------------------------------------------------- רכישות פריט (single / bundle)

/** תיאור ההזמנה של פריט (למייל / לתנועה הכספית / למנהלת) */
export function describeItem(kind: PayableItemKind, title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (kind === "single") return t ? `הורדה בודדת – ${t}` : "הורדה בודדת";
  return t ? `קובץ מורחב – תיקייה «${t}»` : "קובץ מורחב (תיקייה שלמה)";
}

/** השורה ב-purchases לרכישת פריט – בדיוק כמו purchaseAction הישן: בלי מכסה, בלי תוקף, הסכום אחרי קופון */
export function itemPurchaseRow(intent: { userId: number; plan: PayableItemKind; materialId: number | null; itemCategoryId: number | null; amount: number; reference: string }) {
  if (intent.plan === "single") {
    if (!intent.materialId) throw new Error("לבקשת הורדה בודדת אין מזהה חומר");
    return { userId: intent.userId, plan: "single" as const, materialId: intent.materialId, categoryId: intent.itemCategoryId, amount: intent.amount, downloadsLimit: null, endsAt: null, termDays: null, paymentRef: intent.reference, status: "active" as const };
  }
  if (!intent.itemCategoryId) throw new Error("לבקשת קובץ מורחב אין מזהה תיקייה");
  return { userId: intent.userId, plan: "bundle" as const, materialId: null, categoryId: intent.itemCategoryId, amount: intent.amount, downloadsLimit: null, endsAt: null, termDays: null, paymentRef: intent.reference, status: "active" as const };
}

/** לאן מפנים אחרי תשלום מוצלח על פריט: תיקייה → הדף שלה עם הורדת כל הקבצים (?dlall=1, כמו בקופה הישנה); חומר → דף הפרק */
export function itemSuccessHref(kind: PayableItemKind, folderHref: string): string {
  return kind === "bundle" ? `${folderHref}?dlall=1` : folderHref;
}

/** שורת רכישה פעילה (לא פגה, status active) – מה שצריך כדי להחליט אם הפריט כבר "שלה" */
export type ActivePurchaseLite = {
  plan: string;
  materialId: number | null;
  categoryId: number | null;
  subjectsPending: boolean;
  downloadsLimit: number | null;
  downloadsUsed: number;
};
export type ItemCoverage = "owned" | "bundle" | "subscription";
const SUBSCRIPTION_PLANS = ["subject_monthly", "custom_monthly", "yearly", "substitute_3m", "substitute_daily"];

/**
 * האם המורה כבר מחזיקה גישה לפריט – אז לא נותנים לה לשלם עליו שוב (כמו hasActiveSamePlan למסלולים):
 *   owned        – אותו חומר נרכש בודד / אותה תיקייה נרכשה כקובץ מורחב.
 *   bundle       – תיקיית-אב של הפריט נרכשה כקובץ מורחב (מכסה את כל מה שבתוכה).
 *   subscription – מנוי פעיל שמכסה את הפריט (מקצוע בשרשרת, או מנוי לכל המקצועות), עם מקצועות נבחרים ומכסה שלא נגמרה.
 *                  לתיקייה: ממלאת מקום יומית (סל של 20 הורדות) לא חוסמת – ייתכן שהתיקייה גדולה מהסל.
 * chainIds = שרשרת הקטגוריות של הפריט (מהמקצוע עד התיקייה עצמה / התיקייה של החומר). אותם כללים כמו checkEntitlement.
 */
export function itemAlreadyCovered(
  kind: PayableItemKind,
  target: { materialId?: number | null; categoryId: number; chainIds: number[] },
  active: ActivePurchaseLite[],
): ItemCoverage | null {
  const chain = new Set(target.chainIds);
  chain.add(target.categoryId);
  if (kind === "single" && target.materialId && active.some((p) => p.plan === "single" && p.materialId === target.materialId)) return "owned";
  for (const p of active) {
    if (p.plan !== "bundle" || p.categoryId === null || !chain.has(p.categoryId)) continue;
    return kind === "bundle" && p.categoryId === target.categoryId ? "owned" : "bundle";
  }
  for (const p of active) {
    if (!SUBSCRIPTION_PLANS.includes(p.plan) || p.subjectsPending) continue;
    if (kind === "bundle" && p.plan === "substitute_daily") continue;
    if (p.categoryId !== null && !chain.has(p.categoryId)) continue;
    if (p.downloadsLimit !== null && p.downloadsUsed >= p.downloadsLimit) continue;
    return "subscription";
  }
  return null;
}

export const ITEM_COVERED_TEXT: Record<ItemCoverage, string> = {
  owned: "כבר רכשת את הפריט הזה – אין צורך לשלם שוב. אפשר להוריד אותו מהדף שלו או מהאזור האישי.",
  bundle: "התיקייה שהפריט הזה נמצא בה כבר שלך (קובץ מורחב) – אין צורך לשלם שוב.",
  subscription: "המנוי הפעיל שלך כבר כולל את הפריט הזה – אין צורך לשלם עליו בנפרד.",
};

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
  /** `Tashloumim` – מספר התשלומים שהעסקה חולקה אליהם (עסקה רגילה: 1; הסכום ב-Amount הוא הכולל). undefined/null = לא ידוע */
  installments?: number | null;
  /** `TransactionType` כפי שנדרים מחזירים ("רגיל" / תשלומים / הוראת קבע) */
  txType?: string | null;
  /** `KevaId` – קיים רק בחיוב של הוראת קבע */
  kevaId?: string | null;
};

/** השדות היחידים שנשמרים ב-raw (M6): בלי ת"ז, כתובת, שם – רק מה שדרוש לאבחון ההתאמה */
export const RAW_KEEP_FIELDS = ["TransactionId", "Amount", "Currency", "Comments", "TransactionTime", "Confirmation", "LastNum", "Status", "TransactionType", "Groupe", "Tashloumim", "FirstTashloum", "NextTashloum", "KevaId", "KabalaId"] as const;

/** `Tashloumim` → מספר שלם ≥1, או null אם ריק/לא מספרי */
function parseInstallments(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v.trim());
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

/** שדות התנאים של עסקה (תשלומים / סוג / הוראת קבע) משורת היסטוריה או מ-`raw` השמור במטמון – אותם שמות שדות */
export function txTermsFromRow(row: unknown): { installments: number | null; txType: string | null; kevaId: string | null } {
  return {
    installments: parseInstallments(pick(row, ["Tashloumim", "Tashlumim"])),
    txType: pick(row, ["TransactionType", "Type"])?.slice(0, 40) ?? null,
    kevaId: pick(row, ["KevaId"])?.slice(0, 40) ?? null,
  };
}
export function txTermsFromRaw(raw: string | null | undefined): { installments: number | null; txType: string | null; kevaId: string | null } {
  try {
    return txTermsFromRow(raw ? JSON.parse(raw) : null);
  } catch {
    return { installments: null, txType: null, kevaId: null };
  }
}

/** העסקה היא חיוב של הוראת קבע (יש KevaId, או סוג העסקה מציין הוראת קבע) */
export function isKevaTx(tx: Pick<NormalizedTx, "txType" | "kevaId">): boolean {
  return !!tx.kevaId || /הוראת\s*קבע|הו["״']?ק|keva|^hk$/i.test(tx.txType ?? "");
}

/**
 * האם העסקה שנדרים החזירו עונה בדיוק לתנאים שנקבעו בבקשה (כל סטייה = לא מתאימים אוטומטית, רק אישור ידני חריג):
 *   normal – הסכום המלא; מספר התשלומים זהה (`Tashloumim`; לא ידוע מתקבל רק כשצפוי תשלום אחד); וזו לא הוראת קבע.
 *   keva   – סכום החיוב החודשי; חיוב של הוראת קבע (KevaId / סוג העסקה). מספר החודשים נבדק מול רשומת ההוראה עצמה (checkKevaRecord).
 */
export function checkTxTerms(terms: ChargeTerms, tx: Pick<NormalizedTx, "amount" | "installments" | "txType" | "kevaId">): { ok: boolean; reason: string } {
  if (tx.amount !== terms.chargeAmount) {
    return { ok: false, reason: `סכום העסקה (₪${agorotToAmountString(tx.amount)}) שונה מהצפוי (₪${agorotToAmountString(terms.chargeAmount)})` };
  }
  const keva = isKevaTx(tx);
  if (terms.mode === "keva") {
    return keva ? { ok: true, reason: "" } : { ok: false, reason: "העסקה אינה חיוב של הוראת קבע, אבל התבקשה הוראת קבע" };
  }
  if (keva) return { ok: false, reason: "העסקה היא חיוב של הוראת קבע, אבל התבקש תשלום רגיל" };
  const got = tx.installments ?? null;
  if (got === null) {
    return terms.installments === 1 ? { ok: true, reason: "" } : { ok: false, reason: `מספר התשלומים בעסקה לא ידוע (צפויים ${terms.installments})` };
  }
  return got === terms.installments ? { ok: true, reason: "" } : { ok: false, reason: `מספר התשלומים בעסקה (${got}) שונה מהצפוי (${terms.installments})` };
}

/** רשומת הוראת קבע מ-`GetKevaId` (השדות שאנחנו בודקים בלבד) */
export type KevaRecord = { id: string; status: string; amount: number | null; remaining: number | null; done: number | null; frequency: string; currency: string };

/** `GetKevaId` → רשומה מנורמלת. KevaTashlumim = יתרת חיובים (ריק = ללא הגבלה); KevaSuccess = חיובים שבוצעו */
export function parseKevaRecord(json: unknown): KevaRecord | null {
  const id = pick(json, ["KevaId"]);
  if (!id) return null;
  const num = (v: string | undefined) => {
    if (v === undefined) return null;
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const amt = shekelsToAgorot(pick(json, ["KevaAmount"]));
  return {
    id: id.trim(),
    status: (pick(json, ["KevaStatus"]) ?? "").trim(),
    amount: amt,
    remaining: num(pick(json, ["KevaTashlumim"])),
    done: num(pick(json, ["KevaSuccess"])),
    frequency: (pick(json, ["KevaFrequency"]) ?? "1").trim(),
    currency: (pick(json, ["KevaCurrency"]) ?? "1").trim(),
  };
}

/**
 * אימות ההוראה עצמה מול התנאים שנקבעו (לפני שפותחים מנוי על חיוב ראשון): פעילה, חודשית, שקלים, סכום חודשי זהה, ומספר החיובים
 * הכולל (בוצעו + יתרה) זהה למצופה – הוראה "ללא הגבלה" (יתרה ריקה) או בסכום אחר לא מתקבלת אוטומטית.
 */
export function checkKevaRecord(terms: ChargeTerms, rec: KevaRecord): { ok: boolean; reason: string } {
  if (rec.status !== "1") return { ok: false, reason: `הוראת הקבע ${rec.id} אינה פעילה (סטטוס ${rec.status || "לא ידוע"})` };
  if (rec.frequency !== "1") return { ok: false, reason: `הוראת הקבע ${rec.id} אינה חודשית` };
  if (rec.currency !== "1") return { ok: false, reason: `הוראת הקבע ${rec.id} אינה בש"ח` };
  if (rec.amount !== terms.chargeAmount) return { ok: false, reason: `סכום החיוב החודשי בהוראה ${rec.id} (₪${rec.amount === null ? "?" : agorotToAmountString(rec.amount)}) שונה מהצפוי (₪${agorotToAmountString(terms.chargeAmount)})` };
  if (rec.remaining === null || rec.done === null) return { ok: false, reason: `מספר החיובים בהוראה ${rec.id} אינו מוגבל או לא ידוע – לבדיקה ידנית` };
  if (rec.remaining + rec.done !== terms.installments) return { ok: false, reason: `מספר החיובים בהוראה ${rec.id} (${rec.remaining + rec.done}) שונה מהצפוי (${terms.installments})` };
  return { ok: true, reason: "" };
}
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
    ...txTermsFromRow(row),
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

/**
 * נדרים פלוס לא מאפשרים שני חיובים באותו סכום, לאותו כרטיס, באותו יום. לקוחה שקונה כמה תיקיות/קבצים באותו סכום באותו יום
 * מקבלת על כל רכישה נוספת הנחה של `step` אגורות (10, 20, ...) – הסכום הראשון הפנוי שאין לה בו עדיין בקשה היום.
 * `used` = הסכומים (באגורות) של הבקשות האחרות שלה באותו יום. סכום שלא תפוס – נשאר כמו שהוא. לא יורדים מתחת ל-`minAmount`;
 * אם אין מקום מטה (מחיר נמוך מאוד) – מוסיפים `step` במקום להוריד. `adjustedBy` = כמה הורדנו (שלילי = הוספנו).
 */
export const SAME_DAY_STEP_AGOROT = 10;
export function pickDistinctAmount(amount: number, used: Iterable<number>, step = SAME_DAY_STEP_AGOROT, minAmount = 100): { amount: number; adjustedBy: number } {
  const taken = new Set(used);
  if (!taken.has(amount)) return { amount, adjustedBy: 0 };
  for (let k = 1; amount - step * k >= minAmount; k++) {
    const c = amount - step * k;
    if (!taken.has(c)) return { amount: c, adjustedBy: amount - c };
  }
  for (let k = 1; ; k++) {
    const c = amount + step * k;
    if (!taken.has(c)) return { amount: c, adjustedBy: amount - c };
  }
}

/** האם שתי בקשות "אותה הזמנה" (N2) – מסלול, מקצועות (ללא סדר), דלג, סכום; ולפריט – אותו חומר / אותה תיקייה */
type IntentParams = { plan: string; categoryIds: number[]; subjectsPending: boolean; amount: number; materialId?: number | null; itemCategoryId?: number | null; chargeMode?: string | null; installments?: number | null };
export function sameIntentParams(a: IntentParams, b: IntentParams): boolean {
  const sa = [...new Set(a.categoryIds)].sort((x, y) => x - y).join(",");
  const sb = [...new Set(b.categoryIds)].sort((x, y) => x - y).join(",");
  return (
    a.plan === b.plan &&
    a.subjectsPending === b.subjectsPending &&
    a.amount === b.amount &&
    (a.chargeMode === "keva" ? "keva" : "normal") === (b.chargeMode === "keva" ? "keva" : "normal") &&
    (a.installments ?? 1) === (b.installments ?? 1) &&
    sa === sb &&
    (a.materialId ?? null) === (b.materialId ?? null) &&
    (a.itemCategoryId ?? null) === (b.itemCategoryId ?? null)
  );
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
  /** תנאי התשלום שנקבעו בבקשה (ברירת מחדל: תשלום אחד בסכום המלא) */
  chargeMode?: string | null;
  installments?: number | null;
  chargeAmount?: number | null;
};
export type TxForMatch = NormalizedTx & { fetchedAt: Date; matchedPaymentId: number | null };

/**
 * מועמדות להתאמה לבקשה: עסקה מאושרת (יש Confirmation, ואין סטטוס כישלון), סכום זהה בדיוק, ש"ח, לא משויכת, עם מועד עסקה
 * מפוענח (בלי מועד – לא מועמדת; לא משתמשים במועד הקריאה), שאינו לפני יצירת הבקשה (פחות חסד קטן) ואינו לפני מועד החיתוך
 * (cutoffAt – תחילת ההדלקה; עסקאות היסטוריות לעולם לא מתאימות). strong = מזהה הבקשה בהערה; weak = טלפון זהה או מייל זהה.
 */
export function findCandidates(p: OpenPaymentForMatch, txs: TxForMatch[], cutoffAt: Date | null = null): { strong: TxForMatch[]; weak: TxForMatch[]; mismatch: { tx: TxForMatch; reason: string }[] } {
  const strong: TxForMatch[] = [];
  const weak: TxForMatch[] = [];
  /** עסקאות שנושאות את מזהה הבקשה (ולכן כנראה שלה), מאושרות ובש"ח, אבל לא בתנאים שנקבעו – סכום/תשלומים/הוראת קבע. לעולם לא ממתאימות אוטומטית; מוצגות לאישור ידני */
  const mismatch: { tx: TxForMatch; reason: string }[] = [];
  const notBefore = Math.max(p.createdAt.getTime() - MATCH_EARLY_GRACE_MS, cutoffAt?.getTime() ?? 0);
  const pPhone = phoneDigits(p.phone);
  const pEmail = emailKey(p.email);
  const terms = termsOfPayment({ amount: p.amount, chargeMode: p.chargeMode, installments: p.installments, chargeAmount: p.chargeAmount });
  for (const t of txs) {
    if (t.matchedPaymentId !== null) continue;
    if (!t.approved || !t.transactionAt) continue;
    if (t.amount <= 0 || !isIls(t.currency)) continue;
    if (t.transactionAt.getTime() < notBefore) continue;
    const isRef = extractReference(t.comments) === p.reference;
    const termsCheck = checkTxTerms(terms, t);
    if (!termsCheck.ok) {
      if (isRef) mismatch.push({ tx: t, reason: termsCheck.reason });
      continue;
    }
    if (isRef) {
      strong.push(t);
      continue;
    }
    const phoneOk = !!pPhone && pPhone.length >= 9 && t.phone === pPhone;
    const emailOk = !!pEmail && pEmail.includes("@") && t.email === pEmail;
    if (phoneOk || emailOk) weak.push(t);
  }
  return { strong, weak, mismatch };
}

export type MatchKind = "strong" | "weak";
export type AutoMatch = { paymentId: number; tx: TxForMatch; kind: MatchKind };
export type ReviewItem = { paymentId: number; reason: string; transactionIds: string[] };

/**
 * ההחלטה הגלובלית (מדיניות הבעלים, 22.10.2026):
 *   strong – מזהה הבקשה בהערת העסקה: בדיוק עסקה אחת כזו לבקשה, שלא טוענת לה בקשה אחרת → מנוי. עדיף תמיד.
 *   weak  – טלפון/מייל + סכום זהה (findCandidates כבר דורש: מאושרת, ש"ח, חיובית, אחרי cutoff ואחרי createdAt-15 דק', לא
 *           משויכת) – **משדרג אוטומטית רק בייחודיות מלאה**: (א) לבקשה בדיוק מועמדת אחת (strong+weak, בלי עסקאות שכבר נתפסו);
 *           (ב) לעסקה הזו בדיוק בקשה פתוחה אחת שהיא יכולה להתאים לה, בכל סוג התאמה (אז גם אין strong חלופי שמצביע לבקשה אחרת).
 *   כל ספק → review ("ממתין לאישור ידני") עם מספרי העסקאות. אותה עסקה לעולם לא מוקצית לשתי בקשות.
 * הנימוק: התוקף משלם בעצמו סכום מדויק; הסיכון היחיד הוא שתשלום של מישהי אחרת באותו סכום + טלפון/מייל ייתפס – ולכן הייחודיות.
 */
export function decideAutoMatches(payments: OpenPaymentForMatch[], txs: TxForMatch[], cutoffAt: Date | null = null): { matches: AutoMatch[]; review: ReviewItem[] } {
  const matches: AutoMatch[] = [];
  const review: ReviewItem[] = [];
  const taken = new Set<string>();
  const cands = new Map<number, ReturnType<typeof findCandidates>>();
  for (const p of payments) cands.set(p.id, findCandidates(p, txs, cutoffAt));
  // כמה בקשות פתוחות "טוענות" לכל עסקה – strong ו-weak יחד (תנאי 3+4)
  const claimers = new Map<string, number>();
  const strongClaimers = new Map<string, number>();
  for (const p of payments) {
    const c = cands.get(p.id)!;
    for (const t of c.strong) {
      claimers.set(t.transactionId, (claimers.get(t.transactionId) ?? 0) + 1);
      strongClaimers.set(t.transactionId, (strongClaimers.get(t.transactionId) ?? 0) + 1);
    }
    for (const t of c.weak) claimers.set(t.transactionId, (claimers.get(t.transactionId) ?? 0) + 1);
  }

  // strong קודם
  const decided = new Set<number>();
  for (const p of payments) {
    const c = cands.get(p.id)!;
    if (c.strong.length === 0) {
      // שילמה עם מזהה הבקשה אבל לא בתנאים שנקבעו (סכום אחר / מספר תשלומים אחר / הוראת קבע במקום רגיל או להפך) – לא משדרגים, מציגים לאישור ידני
      if (c.mismatch.length) {
        decided.add(p.id);
        review.push({ paymentId: p.id, reason: `התשלום ${c.mismatch[0].tx.transactionId} לא תואם את תנאי הבקשה: ${c.mismatch[0].reason}`, transactionIds: c.mismatch.map((m) => m.tx.transactionId) });
      }
      continue;
    }
    decided.add(p.id);
    if (c.strong.length === 1 && strongClaimers.get(c.strong[0].transactionId) === 1 && !taken.has(c.strong[0].transactionId)) {
      taken.add(c.strong[0].transactionId);
      matches.push({ paymentId: p.id, tx: c.strong[0], kind: "strong" });
    } else {
      review.push({ paymentId: p.id, reason: c.strong.length > 1 ? `נמצאו ${c.strong.length} עסקאות עם מזהה הבקשה` : "העסקה עם מזהה הבקשה מתאימה גם לבקשה אחרת", transactionIds: c.strong.map((t) => t.transactionId) });
    }
  }
  // weak – רק בייחודיות מלאה
  for (const p of payments) {
    if (decided.has(p.id)) continue;
    const weak = cands.get(p.id)!.weak.filter((t) => !taken.has(t.transactionId));
    if (weak.length === 0) continue;
    if (weak.length > 1) {
      review.push({ paymentId: p.id, reason: `נמצאו ${weak.length} עסקאות בסכום הזה עם הטלפון/המייל של המורה – לאישור ידני`, transactionIds: weak.map((t) => t.transactionId) });
      continue;
    }
    const t = weak[0];
    if ((claimers.get(t.transactionId) ?? 0) !== 1) {
      review.push({ paymentId: p.id, reason: "העסקה (טלפון/מייל + סכום) מתאימה גם לבקשה פתוחה אחרת – לאישור ידני", transactionIds: [t.transactionId] });
      continue;
    }
    taken.add(t.transactionId);
    matches.push({ paymentId: p.id, tx: t, kind: "weak" });
  }
  return { matches, review };
}

/**
 * אישור ידני עם מספר עסקה שקיים במטמון (M1): העסקה חייבת להיות מאושרת, בסכום זהה לבקשה, חיובית, בש"ח. כל סטייה → סירוב
 * (אלא אם המנהלת מאשרת במפורש "חריג", והסכומים נרשמים באודיט).
 */
export function checkManualTransaction(
  intent: { amount: number; chargeMode?: string | null; installments?: number | null; chargeAmount?: number | null },
  tx: Pick<NormalizedTx, "amount" | "currency" | "approved" | "confirmation"> & Partial<Pick<NormalizedTx, "installments" | "txType" | "kevaId">>,
): { ok: boolean; reason: string } {
  if (!tx.approved) return { ok: false, reason: `לעסקה אין מספר אישור / הסטטוס שלה אינו הצלחה` };
  if (tx.amount <= 0) return { ok: false, reason: `סכום העסקה אינו חיובי (${agorotToAmountString(tx.amount)})` };
  if (!isIls(tx.currency)) return { ok: false, reason: `מטבע העסקה אינו ש"ח (${tx.currency})` };
  if (tx.amount !== intent.amount && !(intent.chargeMode === "keva")) return { ok: false, reason: `סכום העסקה (₪${agorotToAmountString(tx.amount)}) שונה מסכום הבקשה (₪${agorotToAmountString(intent.amount)})` };
  // תנאי התשלום (סכום החיוב, מספר תשלומים, הוראת קבע מול רגיל) – אותה בדיקה כמו בהתאמה האוטומטית
  const terms = checkTxTerms(termsOfPayment(intent), { amount: tx.amount, installments: tx.installments ?? null, txType: tx.txType ?? null, kevaId: tx.kevaId ?? null });
  if (!terms.ok) return terms;
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

/**
 * הטקסט שהמורה רואה לפי הסטטוס – פנייה בלשון נוכחת. stale = processing מעל 48 שעות (N10).
 * kind = סוג ההזמנה (orderKindOf): ברכישת פריט "שולם" מדבר על הקובץ/התיקייה ולא על מנוי.
 */
export function customerStatusText(status: string, assistRequested = false, stale = false, kind: "plan" | PayableItemKind = "plan"): string {
  switch (status) {
    case "paid":
      if (kind === "single") return "התשלום זוהה והקובץ זמין להורדה. תודה!";
      if (kind === "bundle") return "התשלום זוהה – כל קבצי התיקייה זמינים להורדה. תודה!";
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
  api: "הותאם לעסקה בנדרים פלוס (מזהה הבקשה)",
  api_weak: "זוהה לפי טלפון/מייל",
  manual: "אושר ידנית",
  simulated: "סימולציה (פיתוח)",
};
