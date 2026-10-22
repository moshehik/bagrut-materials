import "server-only";
import { getBool } from "@/lib/settings";
import { siteUrl } from "@/lib/mail";
import { getNedarimApiPassword, getNedarimCallbackSecret } from "./secrets";

/**
 * הקונפיגורציה של התשלום דרך נדרים פלוס (שרת בלבד). הסודות: app_secrets (מוצפן, מוחלף מ-/admin/payments) ← משתני סביבה.
 * הריפו ציבורי – לעולם לא בקוד:
 *   NEDARIM_MOSAD_ID        – קוד המוסד בנדרים פלוס (mosad בקישור לדף התשלום + MosadId ב-API) – לא סוד, env בלבד
 *   NEDARIM_API_PASSWORD    – מפתח npk_… ל-Manage3 GetHistoryJson (או app_secrets.nedarim_api_password) – זיהוי התשלומים
 *   NEDARIM_CALLBACK_SECRET – אופציונלי, ≥32 תווים; חלק מכתובת ה-CallBack אם מגדירים אותה בפורטל נדרים (רק מפעיל רענון)
 *   NEDARIM_SECRETS_KEY     – (מומלץ) הסוד הראשי להצפנת app_secrets; בלעדיו נגזר מ-SESSION_SECRET
 *   NEDARIM_SIMULATE=1      – פיתוח מקומי בלבד (לא ב-Vercel): העמוד פעיל בלי הגדרה, "סימולציית תשלום" משלימה בלי נדרים
 * ההדלקה עצמה: ההגדרה nedarim_enabled ב-/admin/settings. תיעוד: docs/nedarim-payments.md
 */
export type NedarimConfig = {
  enabled: boolean;
  simulate: boolean;
  mosadId: string;
  callbackSecret: string;
  hasApiPassword: boolean;
  /** מה חסר כדי שתשלום אמיתי יעבוד (למסך הניהול, לא למורה) */
  missing: string[];
  /** אפשר להציג את העמוד ולקבל תשלומים */
  ready: boolean;
};

const env = (k: string) => (process.env[k] ?? "").trim();

/** מצב דמה מותר רק בפיתוח מקומי: לא בבנייה לפרודקשן ולא בשום סביבת Vercel (גם preview) */
export function simulateAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && !env("VERCEL") && !env("VERCEL_ENV") && env("NEDARIM_SIMULATE") === "1";
}

export async function loadNedarimConfig(): Promise<NedarimConfig> {
  const simulate = simulateAllowed();
  let enabledSetting = false;
  try {
    enabledSetting = await getBool("nedarim_enabled");
  } catch (e) {
    console.error("[nedarim] settings unavailable", e instanceof Error ? e.message : "error");
  }
  const [apiPassword, callbackSecret] = await Promise.all([getNedarimApiPassword(), getNedarimCallbackSecret()]);
  const cfg: NedarimConfig = {
    enabled: simulate || enabledSetting,
    simulate,
    mosadId: env("NEDARIM_MOSAD_ID"),
    callbackSecret: callbackSecret && callbackSecret.length >= 32 ? callbackSecret : "",
    hasApiPassword: !!apiPassword,
    missing: [],
    ready: false,
  };
  if (!cfg.mosadId) cfg.missing.push("קוד מוסד (NEDARIM_MOSAD_ID)");
  if (!cfg.hasApiPassword) cfg.missing.push("מפתח API (npk_… – כרטיס הסודות למטה / NEDARIM_API_PASSWORD) – בלעדיו אי אפשר לזהות תשלומים, הכול יחכה לאישור ידני");
  if (callbackSecret && !cfg.callbackSecret) cfg.missing.push("סוד ה-CallBack קצר מ-32 תווים – לא בשימוש (אופציונלי בכל מקרה)");
  if (!enabledSetting) cfg.missing.push("ההגדרה «תשלום דרך נדרים פלוס» כבויה (/admin/settings)");
  // מוכן = דולק + קוד מוסד (הדף המתארח). בלי מפתח API הבקשות נשארות ממתינות עד אישור ידני – עדיין אפשר לקבל תשלומים.
  cfg.ready = cfg.enabled && (cfg.simulate || !!cfg.mosadId);
  return cfg;
}

/** כתובת ה-CallBack (אופציונלי – להגדרה בפורטל נדרים ברמת המוסד, אם קיים שם); ריק אם אין סוד */
export function callbackUrl(cfg: NedarimConfig): string {
  if (!cfg.callbackSecret) return "";
  return `${siteUrl()}/api/pay/callback?key=${encodeURIComponent(cfg.callbackSecret)}`;
}
