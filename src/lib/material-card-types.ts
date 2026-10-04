import type { Material } from "@/db/schema";

/** סוגי הכרטיסיות בתוך תיקייה (לפי עיצוב "עיצוב כרטיסיה מבפנים") */
export type CardType =
  | "student"
  | "teacher"
  | "quiz"
  | "quiz-answers"
  | "exam"
  | "exam-answers"
  | "dictation"
  | "discussions"
  | "enrichment"
  | "skills"
  | "prep"
  | "presentation";

export type CardStyle = {
  label: string;
  /** דמות מתוך public/images/mat-cards */
  art: string;
  /** צבע גוף הכרטיס */
  body: string;
  /** פס דק מתחת לכותרת */
  strip: string;
  /** רקע פס הרכישה הבודדת (גוון בהיר של צבע הכרטיס) */
  buy: string;
  /** טביעת אצבע לבנה (רק על הכרטיס האפור-ירקרק) */
  lightPrint?: boolean;
  /** צבע ההוי והכיתוב בדף הבית (שונה בין שאלות לתשובות, בניגוד לכרטיסיות) */
  chk?: string;
  /** אייקון רחב: מקבל יותר מקום בכותרת */
  artWide?: boolean;
};

export const CARD_STYLES: Record<CardType, CardStyle> = {
  student: { label: "שכפול לתלמידה", art: "student", body: "#a3c0e6", strip: "#3f6aa0", buy: "#e1ebf8", chk: "#45706f" },
  teacher: { label: "שכפול למורה", art: "teacher", body: "#bcd3f0", strip: "#3f6aa0", buy: "#e8f0fa", chk: "#3f6aa0" },
  quiz: { label: "בוחן", art: "quiz", body: "#f8d9b6", strip: "#c1722b", buy: "#fbeedd", chk: "#9a8566" },
  "quiz-answers": { label: "תשובות לבוחן", art: "quiz-answers", body: "#f5caa0", strip: "#c1722b", buy: "#fbe9d3", chk: "#c1722b" },
  exam: { label: "שאלות מבגרויות", art: "exam", body: "#8cc8a9", strip: "#2c7457", buy: "#d3e9df", chk: "#2c7457" },
  "exam-answers": { label: "תשובות לשאלות מבגרויות", art: "exam-answers", body: "#a6d9bf", strip: "#2c7457", buy: "#dcf0e5", chk: "#b8473b" },
  dictation: { label: "סיכום להכתבה", art: "dictation", body: "#bdeeee", strip: "#3a9ba8", buy: "#e3f7f7" },
  discussions: { label: "דיונים ופעילויות", art: "discussions", body: "#dcffb0", strip: "#6fae52", buy: "#eeffd9", artWide: true },
  enrichment: { label: "דף העשרה", art: "enrichment", body: "#efffb3", strip: "#a3ad2e", buy: "#f7ffd9" },
  skills: { label: "מיומנויות למידה", art: "skills", body: "#fff6b0", strip: "#c9a227", buy: "#fffbd9", artWide: true },
  prep: { label: "הכנה ובקיאות", art: "prep", body: "#ecd0f7", strip: "#9a85b0", buy: "#f5e8fb" },
  presentation: { label: "מצגת לליווי", art: "presentation", body: "#f9c8dc", strip: "#c2577f", buy: "#fce4ee" },
};

/** מידות (רוחב, גובה) של תמונות שם הסוג שבתיקיית public/images/mat-cards/label-*.webp */
export const LABEL_SIZES: Record<CardType, [number, number]> = {
  student: [296, 31],
  teacher: [241, 31],
  quiz: [79, 31],
  "quiz-answers": [258, 36],
  dictation: [274, 32],
  discussions: [296, 33],
  enrichment: [196, 31],
  skills: [305, 31],
  prep: [265, 34],
  presentation: [219, 32],
  exam: [315, 32],
  "exam-answers": [499, 32],
};

/**
 * שורות התצוגה: כל מה ששייך לאותה שורה בעיצוב מוצג יחד, זה לצד זה.
 * לא בכל תיקייה יש את כל הסוגים – סוג שחסר פשוט לא מוצג.
 */
export const CARD_ROWS: CardType[][] = [
  ["student", "teacher"],
  ["quiz", "quiz-answers"],
  ["exam", "exam-answers"],
  ["dictation"],
  ["discussions"],
  ["enrichment"],
  ["skills"],
  ["prep"],
  ["presentation"],
];

function normalize(s: string) {
  return s.replace(/[֑-ׇ]/g, "").replace(/["'״׳]/g, "");
}

/** מסווגת חומר לסוג כרטיסייה לפי שמו (רוב החומרים שמורים כ-"other" במסד, אז השם הוא המקור). null = כרטיס כללי */
export function classifyMaterial(m: Pick<Material, "title" | "kind">): CardType | null {
  const t = normalize(m.title);
  if (/בגרו/.test(t) || m.kind === "past_exam") return /תשובות|פתרונות|פתרון/.test(t) ? "exam-answers" : "exam";
  if (/בוחן/.test(t)) return /תשובות|פתרון/.test(t) ? "quiz-answers" : "quiz";
  if (/הכתבה/.test(t)) return "dictation";
  if (/העשרה/.test(t)) return "enrichment";
  if (/מיומנויות/.test(t)) return "skills";
  if (/הכנה|בקיאות/.test(t)) return "prep";
  if (/פעילות|דיונים/.test(t)) return "discussions";
  if (/מצגת/.test(t) || m.kind === "presentation") return "presentation";
  if (/תלמיד/.test(t)) return "student";
  if (/מורה/.test(t)) return "teacher";
  if (m.kind === "student_sheet") return "student";
  if (m.kind === "teacher_sheet") return "teacher";
  return null;
}
