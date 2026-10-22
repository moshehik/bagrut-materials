/**
 * קטגוריות ("Groupe") של המוסד בנדרים פלוס – לוגיקה טהורה + לקוח API שמקבל fetch מבחוץ (נבדק עם fetch מדומה ב-
 * scripts/nedarim-tests/groupe.test.ts). העטיפה בשרת: src/lib/nedarim/groupe.ts.
 *
 * ה-API (Manage3.aspx, POST body, אומת בפועל 22.10.2026):
 *   GetNewGroupe      → מערך JSON של {id, Name, Amount (מחרוזת), PhoneGroupe, TamalType, GoToMosad, GoToMosadGroupe, GoToTofes, Goal, Cumule}
 *                       (בלי מעטפת; רשימה ריקה = []).
 *   SaveEditGroupe    → Id ריק = יצירה ({"Status":"OK","Id":N}); Id קיים = עדכון ({"Status":"OK"}). חובה לשלוח Id, Name, Amount, Goal,
 *                       Cumule (גם ריקים); בעדכון נשמרים רק הערכים שנשלחו – לכן תמיד שולחים את כל השדות הקיימים (buildSaveParams).
 *                       שם שמתחיל ב-* = קטגוריה מוסתרת. שם כפול → Status:Error.
 *   DeleteEditGroupe  → Id (מחיקה רכה). שגיאות: Result:"Error" או Status:"Error" + Message.
 *   Amount = הסכום המינימלי לתרומה בדף של נדרים (לא "המחיר").
 */
import { z } from "zod";
import { agorotToAmountString, shekelsToAgorot } from "./logic";

export const MANAGE3_URL = "https://matara.pro/nedarimplus/Reports/Manage3.aspx";

export type NedarimCategory = {
  id: number;
  name: string;
  /** שם מוסתר = מתחיל ב-* */
  hidden: boolean;
  /** סכום מינימלי לתרומה, באגורות (null = לא הוגדר) */
  amount: number | null;
  goal: number | null;
  /** עד כה נתרם (אגורות) */
  cumule: number | null;
  phoneGroupe: string;
  tamalType: string;
  goToMosad: string;
  goToMosadGroupe: string;
  goToTofes: string;
};

function pick(obj: unknown, names: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  const lower = new Map(Object.keys(rec).map((k) => [k.toLowerCase(), k]));
  for (const n of names) {
    const k = lower.get(n.toLowerCase());
    if (k !== undefined && rec[k] !== undefined && rec[k] !== null) return String(rec[k]);
  }
  return undefined;
}

/** מערך או {Data:[...]} → רשימה מנורמלת; כל דבר אחר → null (תשובה לא צפויה) */
export function parseGroupeList(json: unknown): NedarimCategory[] | null {
  const rows = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { Data?: unknown }).Data)
      ? (json as { Data: unknown[] }).Data
      : null;
  if (!rows) return null;
  const out: NedarimCategory[] = [];
  for (const r of rows) {
    const id = Number(pick(r, ["id", "Id", "ID", "GroupeId"]));
    if (!Number.isInteger(id) || id <= 0) continue;
    const name = (pick(r, ["Name", "GroupeName"]) ?? "").trim();
    const money = (v: string | undefined) => (v === undefined || v.trim() === "" ? null : shekelsToAgorot(v));
    out.push({
      id,
      name,
      hidden: name.startsWith("*"),
      amount: money(pick(r, ["Amount"])),
      goal: money(pick(r, ["Goal"])),
      cumule: money(pick(r, ["Cumule"])),
      phoneGroupe: pick(r, ["PhoneGroupe"]) ?? "",
      tamalType: pick(r, ["TamalType"]) ?? "",
      goToMosad: pick(r, ["GoToMosad"]) ?? "",
      goToMosadGroupe: pick(r, ["GoToMosadGroupe"]) ?? "",
      goToTofes: pick(r, ["GoToTofes"]) ?? "",
    });
  }
  return out;
}

/** תשובת Save/Delete: {Status:"OK"[,Id]} | {Status|Result:"Error", Message} | טקסט */
export function parseGroupeResult(json: unknown, raw = ""): { ok: boolean; id: number | null; message: string } {
  if (json && typeof json === "object") {
    const status = (pick(json, ["Status", "Result"]) ?? "").trim().toUpperCase();
    const message = (pick(json, ["Message", "Error", "Msg"]) ?? "").trim();
    const idRaw = pick(json, ["Id", "ID", "id"]);
    const id = idRaw && /^\d+$/.test(idRaw.trim()) ? Number(idRaw) : null;
    if (status === "OK" || status === "SUCCESS") return { ok: true, id, message };
    return { ok: false, id: null, message: message || (status ? `נדרים פלוס החזירו ${status}` : "תשובה לא צפויה") };
  }
  const t = String(raw ?? "").trim();
  if (/^ok$/i.test(t)) return { ok: true, id: null, message: "" };
  return { ok: false, id: null, message: t ? `תשובה לא צפויה: ${t.slice(0, 120)}` : "תשובה ריקה" };
}

/** הודעת שגיאה מנדרים → עברית ברורה */
export function friendlyGroupeError(message: string): string {
  const m = message.toLowerCase();
  if (/(exist|duplicate|כפול|קיים)/.test(m)) return "שם כפול – כבר יש קטגוריה בשם הזה";
  if (/(password|unauthori|forbidden|הרשאה|סיסמ)/.test(m)) return "אין הרשאה למפתח ה-API (לבדוק את המפתח / הרשאות ניהול קטגוריות)";
  if (/(not found|לא נמצא)/.test(m)) return "הקטגוריה לא נמצאה בנדרים (אולי נמחקה) – לרענן";
  return message ? `נדרים פלוס: ${message.slice(0, 160)}` : "שגיאה לא ידועה מנדרים פלוס";
}

// ---------------------------------------------------------------------------------------------------------------- ולידציה

const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/;
/** סכום בשקלים: ריק/null = לא מוגדר; אחרת ≥0 עם עד 2 ספרות אחרי הנקודה. מוחזר באגורות. */
export const moneySchema = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null;
    // רק ₪ ורווחים מוסרים; פסיק (אלפים או עשרוני?) דו-משמעי → נדחה
    const s = String(v).trim().replace(/[₪\s]/g, "");
    if (s === "") return null;
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "סכום לא תקין (מספר חיובי, נקודה עשרונית, עד 2 ספרות אחריה)" });
      return z.NEVER;
    }
    return Math.round(Number(s) * 100);
  });

export const categoryInputSchema = z.object({
  id: z
    .union([z.number().int().positive(), z.null()])
    .optional()
    .transform((v) => v ?? null),
  name: z
    .string()
    .trim()
    .min(1, "יש להזין שם")
    .max(100, "שם עד 100 תווים")
    .refine((s) => NO_CONTROL.test(s), "השם מכיל תווים לא חוקיים"),
  amount: moneySchema,
  goal: moneySchema,
  cumule: moneySchema,
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/**
 * הפרמטרים ל-SaveEditGroupe: ממזגים את הקטגוריה הקיימת (אם יש) עם השינוי, ושולחים **תמיד את כל השדות** – כי בעדכון נדרים
 * שומרים רק מה שנשלח. Id ריק = יצירה.
 */
export function buildSaveParams(existing: NedarimCategory | null, patch: { name: string; amount?: number | null; goal?: number | null; cumule?: number | null }): Record<string, string> {
  const money = (v: number | null | undefined, fallback: number | null) => {
    const n = v === undefined ? fallback : v;
    return n === null ? "" : agorotToAmountString(n);
  };
  return {
    Id: existing ? String(existing.id) : "",
    Name: patch.name,
    Amount: money(patch.amount, existing?.amount ?? null),
    Goal: money(patch.goal, existing?.goal ?? null),
    Cumule: money(patch.cumule, existing?.cumule ?? null),
    PhoneGroupe: existing?.phoneGroupe ?? "",
    TamalType: existing?.tamalType ?? "",
    GoToMosad: existing?.goToMosad ?? "",
    GoToMosadGroupe: existing?.goToMosadGroupe ?? "",
    GoToTofes: existing?.goToTofes ?? "",
  };
}

// ---------------------------------------------------------------------------------------------------------------- סנכרון מחירים

/**
 * הסכום המינימלי לקטגוריה: מחיר המסלול, או – כשמאפשרים קופון – המחיר אחרי ההנחה הגבוהה ביותר (אותה נוסחה כמו ב-/api/pay/intent:
 * round(list × (100 − pct) / 100)). Amount של נדרים הוא *מינימום תרומה*: אם הוא גבוה מהסכום שהקופון מחשב, הדף של נדרים יחסום
 * את התשלום המוזל – ולכן המינימום חייב להיות ≤ הסכום הנמוך ביותר שהאתר עשוי לבקש.
 */
export function minimumAmountAgorot(planPriceAgorot: number, maxDiscountPercent: number): number {
  const pct = Math.min(100, Math.max(0, Math.floor(maxDiscountPercent)));
  const discounted = Math.round((planPriceAgorot * (100 - pct)) / 100);
  return Math.max(0, discounted);
}

export type SyncPlanRow = { plan: string; name: string; priceAgorot: number; targetAgorot: number; category: NedarimCategory | null; inSync: boolean };

/** מצב הסנכרון לכל מסלול: הקטגוריה לפי שם (בלי *), הסכום היעד, והאם Amount הנוכחי שווה לו */
export function planSyncRows(
  categories: NedarimCategory[],
  plans: { plan: string; name: string; priceAgorot: number }[],
  maxDiscountPercent: number,
): SyncPlanRow[] {
  const byName = new Map(categories.map((c) => [c.name.replace(/^\*/, "").trim(), c]));
  return plans.map((p) => {
    const category = byName.get(p.name.trim()) ?? null;
    const targetAgorot = minimumAmountAgorot(p.priceAgorot, maxDiscountPercent);
    return { ...p, targetAgorot, category, inSync: !!category && category.amount === targetAgorot };
  });
}

// ---------------------------------------------------------------------------------------------------------------- לקוח API

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal; redirect?: "error"; cache?: "no-store" }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type GroupeClientOptions = { fetchImpl: FetchLike; mosadId: string; apiPassword: string; timeoutMs?: number; redact?: (s: string) => string };

/** לקוח Manage3 לקטגוריות. המפתח רק ב-POST body; שגיאות עוברות redact לפני שהן עולות. */
export function createGroupeClient(opts: GroupeClientOptions) {
  const redact = opts.redact ?? ((s: string) => s);
  async function call(action: string, params: Record<string, string>): Promise<{ raw: string; json: unknown; status: number }> {
    const body = new URLSearchParams({ Action: action, ApiPassword: opts.apiPassword, MosadId: opts.mosadId, ...params });
    const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000) : undefined;
    try {
      const res = await opts.fetchImpl(MANAGE3_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: body.toString(),
        signal: controller?.signal,
        redirect: "error",
        cache: "no-store",
      });
      const raw = (await res.text()).slice(0, 2_000_000);
      if (!res.ok) throw new Error(`Manage3 HTTP ${res.status}`);
      let json: unknown = null;
      try {
        json = JSON.parse(raw);
      } catch {
        /* טקסט */
      }
      return { raw, json, status: res.status };
    } catch (e) {
      throw new Error(redact(e instanceof Error ? e.message : String(e)).slice(0, 200));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    async list(): Promise<NedarimCategory[]> {
      const r = await call("GetNewGroupe", {});
      const list = parseGroupeList(r.json);
      if (!list) throw new Error(friendlyGroupeError(parseGroupeResult(r.json, r.raw).message || "תשובה לא צפויה (לא רשימת קטגוריות)"));
      return list;
    },
    /** יצירה (existing=null) או עדכון – תמיד עם כל השדות. מחזיר את ה-Id (ביצירה מהתשובה, בעדכון הקיים). */
    async save(existing: NedarimCategory | null, patch: { name: string; amount?: number | null; goal?: number | null; cumule?: number | null }): Promise<number | null> {
      const params = buildSaveParams(existing, patch);
      const r = await call("SaveEditGroupe", params);
      const result = parseGroupeResult(r.json, r.raw);
      if (!result.ok) throw new Error(friendlyGroupeError(result.message));
      return existing ? existing.id : result.id;
    },
    async remove(id: number): Promise<void> {
      if (!Number.isInteger(id) || id <= 0) throw new Error("מזהה קטגוריה לא תקין");
      const r = await call("DeleteEditGroupe", { Id: String(id) });
      const result = parseGroupeResult(r.json, r.raw);
      if (!result.ok) throw new Error(friendlyGroupeError(result.message));
    },
  };
}
