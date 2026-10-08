import { WINDOW_TEXT } from "@/lib/bagrut-window-texts";
import { GENERIC_TEXT, buildGenericExplainer, getExplainer, type Explainer } from "@/lib/bagrut-explainers";

type FolderInfo = {
  slug: string;
  title: string;
  description?: string | null;
  questionnaireCode?: string | null;
  excludedNote?: string | null;
};

/**
 * ההסבר של תיקייה בדפי המקצועות — אותו הסבר שמופיע בחלון "הסבר" בתרשים הזרימה (אותם טקסטים, אותה חלונית).
 * סדר העדיפויות כמו בתרשים: טקסט החלון (WINDOW_TEXT) ← הסבר בגרות מפורט ← ניסוח כללי ← תיאור התיקייה עצמה.
 * אין מה להסביר — מחזיר undefined (ואז אין כפתור).
 */
export function folderExplainer(chain: FolderInfo[]): Explainer | undefined {
  if (!chain.length) return undefined;
  const slugs = chain.map((c) => c.slug);
  const key = slugs.join("/");
  const node = chain[chain.length - 1];

  const win = WINDOW_TEXT[key];
  const custom = win ? undefined : getExplainer(slugs);
  if (custom) return custom;

  const lines: string[] = [];
  if (win) lines.push(...win.slice(1));
  else if (GENERIC_TEXT[key]) lines.push(...GENERIC_TEXT[key]);
  else if (node.description) {
    // סמל הנוצה קיים רק בתרשים הבגרויות — בתיקיות אין משמעות למשפט הזה
    const d = node.description.replace(/\s*פרקים עם קטעי מפרשים מסומנים בסמל נוצה\.?/g, "").trim();
    if (!d) {
      // אין מה להוסיף מהתיאור
    } else if (d.startsWith("מפרשים:")) {
      const items = d.slice("מפרשים:".length).split(";").map((s) => s.trim()).filter(Boolean);
      lines.push("קטעי מפרשים בפרק: " + items.join("; "));
    } else if (d.startsWith("בחירה:")) lines.push(d.slice("בחירה:".length).trim());
    else lines.push(d);
  }
  if (node.excludedNote) lines.push("✂ לא נדרש בתשפ״ז (מיקוד): " + node.excludedNote);
  if (!lines.length) return undefined;

  return buildGenericExplainer({
    title: win ? win[0] : node.title,
    description: lines.join("\n"),
    code: node.questionnaireCode,
    ancestorTitles: win ? [] : chain.slice(0, -1).map((c) => c.title),
    childPaths: [],
  });
}
