import type { MaterialKind, Tier, Plan } from "@/db/schema";

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

export const PLANS: Record<
  Plan,
  { label: string; description: string; price?: number; downloadsLimit?: number; days?: number }
> = {
  single: {
    label: "הורדה בודדת",
    description: "היחידה הקטנה ביותר – פרק אחד / נושא אחד",
  },
  bundle: {
    label: "קובץ מורחב",
    description: "תיקייה שלמה – למשל פרשה שלמה עם כל פרקיה",
  },
  subject_monthly: {
    label: "מנוי חודשי למקצוע",
    description: "גישה חודשית למקצוע אחד – עד 30 הורדות",
    price: 6900,
    downloadsLimit: 30,
    days: 30,
  },
  custom_monthly: {
    label: "מנוי חודשי לפי מערכת",
    description: "מותאם למערכת השעות שלך – עד 3 מקצועות, 60 הורדות",
    price: 14900,
    downloadsLimit: 60,
    days: 30,
  },
  yearly: {
    label: "מנוי שנתי",
    description: "כל המקצועות, כל השנה – 400 הורדות",
    price: 89000,
    downloadsLimit: 400,
    days: 365,
  },
};

export const PREMIUM_ADDON_PRICE = 2900; // לחודש

export const SUBJECT_ICONS: Record<string, string> = {
  torah: "📜",
  navi: "🕊️",
  ktuvim: "🎼",
  lashon: "✒️",
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
  tichnut: "💻",
  minhal: "📊",
};

/** בית מעוצב עם תמונה וכיתוב – רק למקצועות/יחידות שיש להם בית משלהם (מוצג בכרטיסי המקצועות) */
const SUBJECT_HOUSE_FILES: Record<string, string> = {
  torah: "house-torah.png",
  navi: "house-navi.png",
  ktuvim: "house-ktuvim.png",
  mishlei: "house-mishlei.png",
  lashon: "house-lashon.png",
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
  tichnut: "house-tichnut.png",
  minhal: "house-minhal.png",
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
  lashon: "#6b7f99",
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
  tichnut: "#a0cad2",
  minhal: "#bbba8d",
};

export function formatPrice(agorot: number) {
  return `₪${(agorot / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
}

export function tierAtLeast(a: Tier, b: Tier) {
  return TIERS[a].order >= TIERS[b].order;
}
