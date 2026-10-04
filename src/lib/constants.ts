import type { MaterialKind, Tier, Plan, SichaSeminar } from "@/db/schema";

export const SITE_NAME = "לו״ז העניין";
export const SITE_TAGLINE = "מתמקדים בעיקר – שיעורים מוכנים למורות במחוז החרדי";
export const SITE_MOTTO = "מתמקדים בעיקר";

export const TIERS: Record<Tier, { label: string; color: string; icon: string; order: number }> = {
  none: { label: "ללא", color: "#9ca3af", icon: "○", order: 0 },
  iron: { label: "ברזל", color: "#6b7280", icon: "🛡️", order: 1 },
  copper: { label: "נחושת", color: "#b45309", icon: "🥉", order: 2 },
  silver: { label: "כסף", color: "#94a3b8", icon: "🥈", order: 3 },
  gold: { label: "זהב", color: "#d4a017", icon: "🥇", order: 4 },
  diamond: { label: "יהלום", color: "#38bdf8", icon: "💎", order: 5 },
};

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

/** סוגי חומרים שנפתחים רק במנוי פרימיום */
export const PREMIUM_KINDS: MaterialKind[] = ["past_exam", "presentation", "tips", "ideas"];

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
  subject_monthly: {
    label: "מנוי חודשי למקצוע",
    description: "גישה מלאה למקצוע אחד – בלי לספור קבצים",
    price: 4900,
    downloadsLimit: 150,
    days: 30,
  },
  custom_monthly: {
    label: "מנוי חודשי לפי מערכת",
    description: "מותאם למערכת השעות שלך – גישה מלאה עד 3 מקצועות",
    price: 9900,
    downloadsLimit: 300,
    days: 30,
  },
  yearly: {
    label: "מנוי שנתי",
    description: "גישה מלאה ל-3 מקצועות, כל השנה",
    price: 58800,
    downloadsLimit: 2000,
    days: 365,
  },
};

export const PREMIUM_ADDON_PRICE = 1900; // לחודש

/** המנוי השנתי מיועד ל-3 מקצועות; כל מקצוע נוסף בתוספת חודשית (באגורות, × 12 חודשים) */
export const YEARLY_INCLUDED_SUBJECTS = 3;
export const YEARLY_EXTRA_SUBJECT_PRICE = 1900;
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

export function tierAtLeast(a: Tier, b: Tier) {
  return TIERS[a].order >= TIERS[b].order;
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
