import "server-only";
import { cache } from "react";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * מערך ההגדרות – key/value בטבלת settings, עם ברירות מחדל בקוד.
 * הוספת הגדרה חדשה = להוסיף שורה ל-DEFAULTS (ולטופס ב-/admin/settings).
 */
export const SETTING_DEFS = {
  site_name: { label: "שם האתר", type: "text", default: "לו״ז העניין", group: "כללי" },
  site_tagline: { label: "כותרת משנה", type: "text", default: "מתמקדים בעיקר – שיעורים מוכנים למורות במחוז החרדי", group: "כללי" },
  admin_email: { label: "מייל מנהל (התראות)", type: "text", default: "", group: "כללי" },
  maintenance_mode: { label: "מצב תחזוקה (האתר סגור למשתמשות, פתוח למנהלת)", type: "boolean", default: "false", group: "כללי" },
  maintenance_message: { label: "הודעת תחזוקה", type: "textarea", default: "האתר בתחזוקה קצרה, נחזור בקרוב.", group: "כללי" },
  registration_open: { label: "הרשמה פתוחה", type: "boolean", default: "true", group: "משתמשות" },
  google_login_enabled: { label: "כניסה עם גוגל", type: "boolean", default: "true", group: "משתמשות" },
  require_email_verification: { label: "דרישת אימות מייל להורדה", type: "boolean", default: "false", group: "משתמשות" },
  daily_download_limit: { label: "מגבלת הורדות וצפיות יומית למשתמשת (0 = ללא)", type: "number", default: "30", group: "הורדות" },
  monthly_download_limit: { label: "מגבלת הורדות וצפיות ב-30 הימים האחרונים למשתמשת – נגד הורדה המונית של תיקיות שלמות (0 = ללא)", type: "number", default: "300", group: "הורדות" },
  free_downloads_require_login: { label: "חומרים חינמיים דורשים התחברות", type: "boolean", default: "true", group: "הורדות" },
  watermark_enabled: { label: "הטבעת סימן מים על PDF", type: "boolean", default: "true", group: "הורדות" },
  watermark_text: { label: "טקסט סימן המים (נוסף למספר האישי)", type: "text", default: "כל הזכויות שמורות. אין להעביר לאחר.", group: "הורדות" },
  default_single_price: { label: "מחיר ברירת מחדל להורדה בודדת (₪)", type: "number", default: "15", group: "מחירים" },
  price_yearly: { label: "מנוי שנתי – המחיר בפועל (₪, סה״כ לשנה; מוצג כ-12 תשלומים. כרגע מחיר היכרות)", type: "number", default: "588", group: "מחירים" },
  yearly_list_price_monthly: { label: "מנוי שנתי – מחיר מחירון לחודש (₪, מוצג מחוק ליד מחיר ההיכרות; בסיום ההשקה אפשר להשוות ל-שנתי÷12)", type: "number", default: "79", group: "מחירים" },
  substitute_price_monthly: { label: "ממלאת מקום 3 חודשים – מחיר מחירון לחודש (₪)", type: "number", default: "180", group: "מחירים" },
  substitute_launch_price_monthly: { label: "ממלאת מקום 3 חודשים – מחיר השקה לחודש (₪)", type: "number", default: "130", group: "מחירים" },
  substitute_daily_price: { label: "ממלאת מקום יומית – מחיר מחירון לסל (₪)", type: "number", default: "200", group: "מחירים" },
  substitute_daily_launch_price: { label: "ממלאת מקום יומית – מחיר מבצע לסל (₪)", type: "number", default: "160", group: "מחירים" },
  substitute_daily_downloads: { label: "ממלאת מקום יומית – מספר צפיות/הורדות בסל (בלי הגבלת זמן)", type: "number", default: "20", group: "מחירים" },
  vat_percent: { label: 'מע"מ (%) לקבלות', type: "number", default: "18", group: "מחירים" },
  forum_enabled: { label: "פורום פעיל", type: "boolean", default: "true", group: "תכונות" },
  sell_enabled: { label: "מכירת חומרים לאתר פעילה", type: "boolean", default: "true", group: "תכונות" },
  cart_enabled: { label: "עגלת קניות פעילה", type: "boolean", default: "true", group: "תכונות" },
  free_trial_enabled: { label: "הורדה חינמית אחת לכל מורה (על כל חומר שתבחר)", type: "boolean", default: "true", group: "תכונות" },
  track_page_views: { label: "רישום היסטוריית גלישה", type: "boolean", default: "true", group: "לוגים" },
  logs_retention_days: { label: "שמירת לוגים (ימים)", type: "number", default: "365", group: "לוגים" },
  online_window_minutes: { label: '"מחוברות כעת" = פעילות ב-X דקות האחרונות', type: "number", default: "5", group: "לוגים" },
  drive_auto_sync: { label: "סנכרון אוטומטי של הדרייב (כל לילה, ב-GitHub; מצרף קבצים חדשים כטיוטה, מחבר החלפות, מעדכן מיקום וגודל — לא מוחק. כבוי כברירת מחדל וצריך גם להפעיל את התזמון ב-drive-sync.yml)", type: "boolean", default: "false", group: "דרייב" },
  announcement: { label: "הודעה בראש האתר (ריק = ללא)", type: "textarea", default: "", group: "תוכן" },
  home_popup_enabled: { label: "הודעה צפה בדף הבית – מופעלת (מופיעה בכל כניסה לדף הבית, 3 שניות אחרי הטעינה; הטקסט נכתב עליה ואז היא נעלמת)", type: "boolean", default: "false", group: "הודעת דף הבית" },
  home_popup_title: { label: "כותרת ההודעה הצפה (ריק = \"יש חדש באתר!\")", type: "text", default: "", group: "הודעת דף הבית" },
  home_popup_items: { label: "ההודעות – שורה ריקה בין הודעה להודעה. בכל הודעה, השורה הראשונה היא הכותרת שלה והשאר הטקסט", type: "textarea", default: "", group: "הודעת דף הבית" },
  footer_text: { label: "טקסט בתחתית האתר", type: "text", default: "", group: "תוכן" },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;

/** כל ההגדרות (ממוזגות עם ברירות המחדל) – cached לבקשה */
export const getSettings = cache(async (): Promise<Record<SettingKey, string>> => {
  const out = Object.fromEntries(
    Object.entries(SETTING_DEFS).map(([k, v]) => [k, v.default]),
  ) as Record<SettingKey, string>;
  try {
    const rows = await db.select().from(settings);
    for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  } catch (e) {
    console.error("[settings] load failed", e);
  }
  return out;
});

export async function getSetting(key: SettingKey): Promise<string> {
  return (await getSettings())[key];
}
export async function getBool(key: SettingKey): Promise<boolean> {
  return (await getSetting(key)) === "true";
}
export async function getNumber(key: SettingKey): Promise<number> {
  const n = Number(await getSetting(key));
  return Number.isFinite(n) ? n : Number(SETTING_DEFS[key].default);
}
