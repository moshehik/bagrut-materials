import type { MaterialKind, Plan, SichaSeminar } from "@/db/schema";

export const SITE_NAME = "לו״ז העניין";
export const SITE_TAGLINE = "מתמקדים בעיקר – שיעורים מוכנים למורות במחוז החרדי";
export const SITE_MOTTO = "מתמקדים בעיקר";

export const MATERIAL_KINDS: Record<MaterialKind, { label: string; icon: string; hint: string }> = {
  student_sheet: {
    label: "דף שכפול לתלמידה",
    icon: "📝",
    hint: "משפטים חסרים להשלמה במהלך השיעור",
  },
  teacher_sheet: {
    label: "דף שכפול למורה",
    icon: "👩‍🏫",
    hint: "מערך מלא עם תשובות, סיפורים, שאלות לחידוד וחידות",
  },
  presentation: { label: "מצגת מלווה", icon: "🖥️", hint: "מצגת לליווי השיעור" },
  past_exam: { label: "שאלות מבגרויות קודמות", icon: "📚", hint: "לפי פרקים, עם פתרונות" },
  tips: { label: "טיפים למסירת הפרק", icon: "💡", hint: "עצות פרקטיות מהשטח" },
  ideas: { label: "רעיונות, חידות וסיפורים", icon: "🎲", hint: "להפיכת השיעור למעניין" },
  other: { label: "אחר", icon: "📎", hint: "" },
};

/** סוג הסמינר שבו נמסרה שיחה במאגר השיחות (שיחה/חברה/כישורי חיים) */
export const SICHA_SEMINARS: Record<SichaSeminar, { label: string; icon: string }> = {
  mainstream: { label: "מיינסטרים", icon: "🏫" },
  kiruv: { label: "קירוב", icon: "🌱" },
  charedi_modern: { label: "חרדי מודרני", icon: "🕯️" },
};

/** קצב ההתחייבות להעלאת שיחה חדשה למאגר השיחות */
export const SICHA_REGULAR_CADENCE_WEEKS = 6;
export const SICHA_HIGH_RATED_CADENCE_WEEKS = 10;
export const SICHA_HIGH_RATED_MIN_AVG = 4;
export const SICHA_HIGH_RATED_MIN_COUNT = 3;

export const PLANS: Record<
  Plan,
  { label: string; description: string; price?: number; downloadsLimit?: number; days?: number }
> = {
  single: {
    label: "הורדה בודדת",
    description: "היחידה הקטנה ביותר – יחידת חומר",
  },
  bundle: {
    label: "קובץ מורחב",
    description: "תיקייה שלמה – למשל פרשה שלמה עם כל פרקיה",
  },
  // שני המסלולים החודשיים הישנים – לא נמכרים יותר (RETIRED_PLANS). נשארים כאן בלי מחיר, רק כדי שתוויות
  // של שורות רכישה היסטוריות ימשיכו להופיע בניהול/בחשבון, ובשביל מענק קופון פרטי (custom_monthly)
  subject_monthly: {
    label: "מנוי חודשי למקצוע (מסלול ישן)",
    description: "מסלול ישן – אינו נמכר יותר",
    downloadsLimit: 150,
    days: 30,
  },
  custom_monthly: {
    label: "מנוי חודשי לפי מערכת (מסלול ישן)",
    description: "מסלול ישן – אינו נמכר יותר",
    downloadsLimit: 300,
    days: 30,
  },
  substitute_3m: {
    label: "ממלאת מקום 3 חודשים",
    description: "מקצוע אחד – אפשר להרחיב עד 3 מקצועות באותו מחיר",
    price: 39000, // 3 × מחיר ההשקה החודשי; בפועל מההגדרות (getPlanPrices)
    downloadsLimit: 900,
    days: 90,
  },
  substitute_daily: {
    label: "ממלאת מקום יומית",
    description: "סל צפיות או הורדות, בלי הגבלת זמן",
    price: 16000, // מחיר מבצע; בפועל מההגדרות (getPlanPrices)
    downloadsLimit: 20,
  },
  yearly: {
    label: "מנוי שנתי",
    description: "מנוי למקצוע – אפשר להרחיב עד 3 מקצועות באותו מחיר",
    price: 58800,
    downloadsLimit: 2000,
    days: 365,
  },
};

/**
 * מסלולים שהוסרו מהמכירה (2026-10-06): ערכי ה-enum נשארים ב-DB בשביל שורות היסטוריות, אבל הקופה, העגלה
 * והמנוי הידני מסרבים להם. שורות ישנות פעילות עדיין מקנות גישה (checkEntitlement לא מסנן לפי זה).
 */
export const RETIRED_PLANS: readonly Plan[] = ["subject_monthly", "custom_monthly"];
export function isRetiredPlan(plan: string): boolean {
  return (RETIRED_PLANS as readonly string[]).includes(plan);
}
export const RETIRED_PLAN_MESSAGE = "המסלול הזה כבר לא קיים – אפשר לבחור מסלול מעודכן בעמוד המסלולים";

/**
 * המנוי השנתי הוא מנוי למקצוע (מחיר אחד), ואפשר להרחיב אותו עד YEARLY_INCLUDED_SUBJECTS מקצועות באותו מחיר
 * (לבחור כבר ברכישה, או להוסיף במהלך השנה – מקצוע שנוסף מסתיים יחד עם המנוי המקורי).
 * אין תוספת תשלום למקצוע רביעי – המכסה היא 3
 */
export const YEARLY_INCLUDED_SUBJECTS = 3;
/** המחיר החודשי המלא של המנוי השנתי (באגורות) – מוצג מחוק ליד מחיר המבצע בפועל (PLANS.yearly.price / 12) */
export const YEARLY_LIST_PRICE_MONTHLY = 7900;

/** מסלול "ממלאת מקום 3 חודשים": מחיר חודשי רגיל ומחיר קופון ההשקה (באגורות). כרגע לתצוגה בלבד – אין לו עדיין רכישה בסל */
export const SUBSTITUTE_MONTHS = 3;
export const SUBSTITUTE_PRICE_MONTHLY = 18000;
export const SUBSTITUTE_LAUNCH_PRICE_MONTHLY = 13000;
/** מסלול "ממלאת מקום יומית": סל של צפיות או הורדות (לא לפי חודש), מחיר רגיל ומחיר מבצע (באגורות). גם הוא לתצוגה בלבד */
export const SUBSTITUTE_DAILY_DOWNLOADS = 20;
export const SUBSTITUTE_DAILY_PRICE = 20000;
export const SUBSTITUTE_DAILY_LAUNCH_PRICE = 16000;

/** שם מקצוע לתצוגה בבחירת מקצועות: שלושת תחומי הלשון מוצגים כ"לשון – מערכת הצורות" וכו' */
export function subjectDisplayTitle(slug: string, title: string): string {
  return slug.startsWith("lashon-") && !title.startsWith("לשון") ? `לשון – ${title}` : title;
}

export const SUBJECT_ICONS: Record<string, string> = {
  torah: "📜",
  navi: "🕊️",
  ktuvim: "🎼",
  "lashon-tzurot": "✒️",
  "lashon-tachbir": "✒️",
  "lashon-havaa": "✒️",
  sifrut: "📖",
  english: "🔤",
  yahadut: "🕯️",
  math: "➗",
  dinim: "⚖️",
  history: "🏛️",
  ezrachut: "🏛",
  sicha: "💬",
  chevra: "🤝",
  teacher: "🎓",
  megilot: "📃",
  minhal: "📊",
  "chinuch-pinansi": "💰",
};

/** צבע ייחודי לכל מקצוע — גוונים שונים סביב גלגל הצבעים, בלי כפילויות */
export const SUBJECT_COLORS: Record<string, string> = {
  torah: "#2f6fed", // כחול
  navi: "#14b8a6", // טורקיז
  ktuvim: "#8b5cf6", // סגול
  "lashon-tzurot": "#f59e0b", // ענבר
  "lashon-tachbir": "#d97706", // ענבר כהה
  "lashon-havaa": "#fbbf24", // ענבר בהיר
  sifrut: "#ec4899", // ורוד
  english: "#dc2626", // אדום
  yahadut: "#4f46e5", // אינדיגו
  math: "#22c55e", // ירוק
  dinim: "#eab308", // זהב-חרדל
  history: "#8a5a2b", // חום אדמה
  ezrachut: "#0ea5e9", // תכלת
  minhal: "#84cc16", // ירוק-זית
  sicha: "#e11d48", // אדום-ורדרד
  chevra: "#c026d3", // פוקסיה
  teacher: "#0d9488", // ירוק-ים כהה
  "chinuch-pinansi": "#a3a86c", // ירוק-זית כספי
};

/** בית מעוצב עם תמונה וכיתוב – רק למקצועות/יחידות שיש להם בית משלהם (מוצג בכרטיסי המקצועות) */
const SUBJECT_HOUSE_FILES: Record<string, string> = {
  torah: "house-torah.png",
  navi: "house-navi.png",
  ktuvim: "house-ktuvim.png",
  mishlei: "house-mishlei.png",
  "lashon-tzurot": "house-lashon-tzurot.png",
  "lashon-tachbir": "house-lashon-tachbir.png",
  "lashon-havaa": "house-lashon-havaa.png",
  sifrut: "house-sifrut.png",
  english: "house-english.png",
  yahadut: "house-yahadut.png",
  dinim: "house-dinim.png",
  history: "house-history.png",
  ezrachut: "house-ezrachut.png",
  sicha: "house-sicha.png",
  chevra: "house-chevra.png",
  math: "house-math.png",
  teacher: "house-teacher.png",
  minhal: "house-minhal.png",
  "chinuch-pinansi": "house-chinuch-pinansi.png",
  "kishurei-chaim": "house-kishurei-chaim.png",
};

export const SUBJECT_HOUSES: Record<string, string> = Object.fromEntries(
  Object.entries(SUBJECT_HOUSE_FILES).map(([slug, file]) => [slug, `/images/houses/${file}`]),
);

/** צבע זהות לכל בית — משמש לצביעת חלון הבית ב-hover בדף הבית */
export const SUBJECT_HOUSE_COLORS: Record<string, string> = {
  torah: "#b8895a",
  navi: "#8a9bb8",
  ktuvim: "#c9a15e",
  mishlei: "#7fa87f",
  "lashon-tzurot": "#a493cf",
  "lashon-tachbir": "#d98a5f",
  "lashon-havaa": "#d58a9c",
  sifrut: "#b5766a",
  english: "#5a9bb0",
  yahadut: "#9b8bc4",
  dinim: "#7d8fa3",
  history: "#a68a5c",
  ezrachut: "#6f8faa",
  sicha: "#6fb8a8",
  chevra: "#d99a5c",
  math: "#7a8a89",
  teacher: "#b0729a",
  minhal: "#bbba8d",
  "chinuch-pinansi": "#c3bd8e",
  "kishurei-chaim": "#059669",
};

export function formatPrice(agorot: number) {
  return `₪${(agorot / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
}

/** מחיר רכישה חד-פעמית של יחידה/פרק שלם (כל הקבצים שבו) – 15 ש"ח, באגורות */
export const UNIT_BUNDLE_PRICE = 1500;

/**
 * מחיר קובץ מורחב לתיקייה: מחיר שהוגדר ידנית, אחרת 15 ש"ח ליחידה (תיקייה ללא תתי-תיקיות),
 * ואחרת (תיקייה עם תתי-פרקים) 70% מסכום מחירי החומרים בה.
 */
export function bundlePriceFor(opts: { bundlePrice: number | null; isLeaf: boolean; materialsTotal: number }) {
  if (opts.bundlePrice) return opts.bundlePrice;
  if (opts.isLeaf) return UNIT_BUNDLE_PRICE;
  return Math.round(opts.materialsTotal * 0.7);
}
