import "server-only";
import { getBool } from "@/lib/settings";
import { siteUrl } from "@/lib/mail";

/**
 * הקונפיגורציה של התשלום דרך נדרים פלוס (שרת בלבד). כל הסודות במשתני סביבה בלבד – הריפו ציבורי, לא ב-DB ולא בקוד:
 *   NEDARIM_MOSAD_ID        – קוד המוסד בנדרים פלוס (Mosad ב-FinishTransaction2)
 *   NEDARIM_API_VALID       – ה-ApiValid של ה-iframe שנדרים מסרו למוסד
 *   NEDARIM_API_PASSWORD    – מפתח npk_… ל-Manage3 (reports.matara.pro > הגדרות > API) – האימות האוטומטי של כל תשלום
 *   NEDARIM_CALLBACK_SECRET – מחרוזת אקראית ארוכה; חלק מכתובת ה-CallBack (/api/pay/callback?key=…)
 *   NEDARIM_TRUST_CALLBACK=1 – (לא מומלץ) להשלים לפי CallBack גם בלי מפתח API
 *   NEDARIM_SIMULATE=1      – פיתוח בלבד (לא בפרודקשן): העמוד פעיל בלי הגדרה, וכפתור "סימולציית תשלום" משלים בלי נדרים
 * ההדלקה עצמה: ההגדרה nedarim_enabled ב-/admin/settings. תיעוד: docs/nedarim-payments.md
 */
export type NedarimConfig = {
  enabled: boolean;
  simulate: boolean;
  mosadId: string;
  apiValid: string;
  callbackSecret: string;
  hasApiPassword: boolean;
  trustCallback: boolean;
  /** מה חסר כדי שתשלום אמיתי יעבוד (למסך הניהול, לא למורה) */
  missing: string[];
  /** אפשר להציג את העמוד ולקבל תשלומים */
  ready: boolean;
};

const env = (k: string) => (process.env[k] ?? "").trim();

export async function loadNedarimConfig(): Promise<NedarimConfig> {
  const simulate = process.env.NODE_ENV !== "production" && env("NEDARIM_SIMULATE") === "1";
  let enabledSetting = false;
  try {
    enabledSetting = await getBool("nedarim_enabled");
  } catch (e) {
    console.error("[nedarim] settings unavailable", e);
  }
  const cfg: NedarimConfig = {
    enabled: simulate || enabledSetting,
    simulate,
    mosadId: env("NEDARIM_MOSAD_ID"),
    apiValid: env("NEDARIM_API_VALID"),
    callbackSecret: env("NEDARIM_CALLBACK_SECRET"),
    hasApiPassword: env("NEDARIM_API_PASSWORD").length > 0,
    trustCallback: env("NEDARIM_TRUST_CALLBACK") === "1",
    missing: [],
    ready: false,
  };
  if (!cfg.mosadId) cfg.missing.push("קוד מוסד (NEDARIM_MOSAD_ID)");
  if (!cfg.apiValid) cfg.missing.push("ApiValid של ה-iframe (NEDARIM_API_VALID)");
  if (!cfg.callbackSecret) cfg.missing.push("סוד ה-CallBack (NEDARIM_CALLBACK_SECRET)");
  if (!cfg.hasApiPassword && !cfg.trustCallback) {
    cfg.missing.push("מפתח API לאימות (NEDARIM_API_PASSWORD, npk_…) – בלעדיו כל תשלום יחכה לאישור ידני");
  }
  if (!enabledSetting) cfg.missing.push("ההגדרה «תשלום דרך נדרים פלוס» כבויה (/admin/settings)");
  // מוכן = דולק + יש קוד מוסד, ApiValid וסוד CallBack (מפתח ה-API רק משפר: בלעדיו – אישור ידני)
  cfg.ready = cfg.enabled && (cfg.simulate || (!!cfg.mosadId && !!cfg.apiValid && !!cfg.callbackSecret));
  return cfg;
}

/** כתובת ה-CallBack הציבורית שנשלחת לנדרים בכל עסקה (ריק אם אין סוד) */
export function callbackUrl(cfg: NedarimConfig): string {
  if (!cfg.callbackSecret) return "";
  return `${siteUrl()}/api/pay/callback?key=${encodeURIComponent(cfg.callbackSecret)}`;
}
