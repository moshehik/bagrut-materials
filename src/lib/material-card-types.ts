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
  | "presentation"
  // סוגים נוספים (לא חלק משורות השיעור): כל אחד עם דמות קווית משלו ב-art4/*.svg
  | "events"
  | "characters"
  | "places"
  | "alternative"
  | "reflection"
  | "workbook"
  | "test"
  | "generic";

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
  /** דמות קווית לבנה בקובץ SVG (art4/<art>.svg) במקום webp, והשם נכתב כטקסט בגופן גברת לוין (אין לו תמונת כתב) */
  extra?: boolean;
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
  events: { label: "אירועים", art: "events", body: "#ffd3c4", strip: "#c9573b", buy: "#ffe9e1", extra: true },
  characters: { label: "דמויות", art: "characters", body: "#dcd6f6", strip: "#6a5bb0", buy: "#eeebfb", extra: true },
  places: { label: "מקומות", art: "places", body: "#ecdcb8", strip: "#a8802f", buy: "#f6eed8", extra: true },
  alternative: { label: "הערכה חלופית", art: "alternative", body: "#cfdce2", strip: "#4f6f7d", buy: "#e4edf1", extra: true },
  reflection: { label: "רפלקציה מסכמת", art: "reflection", body: "#cdeedd", strip: "#3d8f6a", buy: "#e3f6ec", extra: true },
  workbook: { label: "חוברת עבודה", art: "workbook", body: "#ffe1b5", strip: "#b5651d", buy: "#fff0d9", extra: true },
  test: { label: "מבחן", art: "test", body: "#f6cfcf", strip: "#b8473b", buy: "#fbe6e6", extra: true },
  generic: { label: "חומר נוסף", art: "generic", body: "#e6e1d4", strip: "#7a7466", buy: "#f3f0e8", extra: true },
};

/** מידות (רוחב, גובה) של תמונות שם הסוג שבתיקיית public/images/mat-cards/label-*.webp */
export const LABEL_SIZES: Partial<Record<CardType, [number, number]>> = {
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

/**
 * סוגים נוספים שמוצגים אחרי שורות השיעור, באותו עיצוב כרטיסייה (לא נכללים ב-CARD_ROWS כי הם
 * לא חלק מ"תיקיית שיעור" בדף הבית ובסינון ההורדות של השיעורים). "generic" = כל חומר שלא זוהה
 * בשום סוג: מקבל כרטיסייה מעוצבת עם שמו, ולא כרטיס "אחר" כללי.
 */
export const EXTRA_ROWS: CardType[][] = [
  ["events", "characters"],
  ["places"],
  ["alternative", "reflection"],
  ["workbook"],
  ["test", "generic"],
];
export const EXTRA_TYPES: CardType[] = EXTRA_ROWS.flat();

/** כותרת הכרטיסייה: שם הסוג (תמונת כתב או טקסט) והמשכו – שם הפרק/היחידה, או מה שבא בשם החומר אחרי הסוג */
export function cardHeading(
  type: CardType,
  title: string,
  folderTitle: string,
): { label: string; suffix: string | null; full: string } {
  const s = CARD_STYLES[type];
  if (type === "generic" || type === "test") return { label: title, suffix: null, full: title };
  if (!s.extra) return { label: s.label, suffix: folderTitle, full: `${s.label} - ${folderTitle}` };
  // "אירועים - יהושע" / "הערכה חלופית - מגילת אסתר פרק ב" / "מגילת רות - חוברת עבודה מלאה (...)": ההמשך הוא החלק שאינו שם הסוג
  const parts = title.split(/s+[-–]s+/);
  const keyword = s.label.split(" ")[0];
  const rest = parts.filter((p) => !p.includes(keyword)).join(" - ").trim();
  const suffix = rest || folderTitle;
  return { label: s.label, suffix, full: `${s.label} - ${suffix}` };
}

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
  // "דף להרחבת השיעור" (תהלים/עזרא-נחמיה: שיח עמוק + משחקים) = כרטיס "דיונים ופעילויות"
  if (/פעילות|דיונים|הרחבת השיעור/.test(t)) return "discussions";
  if (/מצגת/.test(t) || m.kind === "presentation") return "presentation";
  if (/^אירועים/.test(t)) return "events";
  if (/^דמויות/.test(t)) return "characters";
  if (/^מקומות/.test(t)) return "places";
  if (/הערכה חלופית/.test(t)) return "alternative";
  if (/רפלקציה/.test(t)) return "reflection";
  if (/חוברת עבודה/.test(t)) return "workbook";
  if (/מבחן/.test(t)) return "test";
  if (/תלמיד/.test(t)) return "student";
  if (/מורה/.test(t)) return "teacher";
  if (m.kind === "student_sheet") return "student";
  if (m.kind === "teacher_sheet") return "teacher";
  return null;
}
