/**
 * ההתאמה של החיפוש החכם (לוגיקה טהורה - בלי DB, נבדקת ב-scripts/search-match.test.ts).
 *
 * המטרה: שאילתה חופשית עם הקשר רחב, כמו "פרשת בא פרק יג לתלמידה", תמצא את "דף לתלמידה - פרק יג" שבתיקיית "פרק י"ג"
 * שבתוך "בא" - גם כשהמילים יושבות בצמתים שונים בעץ, בסדר אחר, עם מספר ("פרק 13"), עם אות שימוש ("לתלמידה" מול "תלמידה")
 * או עם מילת קישור שלא מופיעה בכותרת ("פרשת").
 *
 * עקרונות:
 *  - נרמול: בלי ניקוד/טעמים, בלי גרש/גרשיים (י"ג = יג), מקפים ופיסוק = רווח, ספרות → אותיות (13 → יג).
 *  - מילות מילוי (פרשת, פרק, דף...) אינן חובה - רק מעלות דירוג כשהן קיימות.
 *  - כל מילה אחרת חייבת להופיע באחד השדות: כותרת הפריט, כותרת התיקייה שלו, כותרות האבות, התיאור, או (ל"תלמידה"/"מורה"...) סוג הקובץ.
 *  - מילה קצרה (אות-שתיים: מספר פרק, "בא") חייבת להופיע כמילה שלמה; מילה ארוכה - כתת-מחרוזת (בלי הסרת אות שימוש: "בשלח" ≠ "שלח").
 *  - אין תוצאה מלאה? תוצאות "קרובות": כולן חוץ ממילה אחת (כשיש לפחות 3 מילים חובה).
 */

const NIKUD = /[֑-ׇ]/g;
const QUOTES = /["'״׳`’”“‘]/g;
const PUNCT = /[-–—_:;,.()[\]{}/|!?*]+/g;

/** מילות קישור/הקשר שאינן חובה בהתאמה */
export const FILLER_WORDS = new Set(["פרשת", "פרשה", "פרק", "פרקים", "דף", "דפי", "של", "את", "עם", "על", "הפרק", "הפרשה", "ספר", "מסלול", "יחידה"]);

/** אותיות שימוש שנדבקות לתחילת מילת סוג-קובץ (ל-תלמידה, ה-מצגת) */
const PREFIX_LETTERS = "הובכלמש";

export const normalize = (s: string | null | undefined): string =>
  (s ?? "").replace(NIKUD, "").replace(QUOTES, "").toLowerCase().replace(PUNCT, " ").replace(/\s+/g, " ").trim();

/** 1..999 → אותיות עבריות (15 → טו, 16 → טז) */
export function toHebrewNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  const hundreds = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  let t = n % 100;
  let s = hundreds[Math.floor(n / 100)];
  if (t === 15) return s + "טו";
  if (t === 16) return s + "טז";
  s += tens[Math.floor(t / 10)] + ones[t % 10];
  return s;
}

/** פירוק שאילתה לאסימונים מנורמלים (ספרות הופכות לאותיות) */
export function tokenize(query: string): string[] {
  return normalize(query)
    .split(" ")
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? normalize(toHebrewNumeral(Number(t))) : t));
}

/** אילו סוגי קבצים מילה מרמזת עליהם ("לתלמידה" → דף תלמידה) - כדי שהמילה תתאים גם כשהכותרת לא כוללת אותה */
function kindsOf(token: string): string[] {
  const t = token.length > 3 && PREFIX_LETTERS.includes(token[0]) ? token.slice(1) : token;
  if (/^תלמיד(ה|ות|ים)?$/.test(t)) return ["student_sheet"];
  if (/^מור(ה|ות)$/.test(t)) return ["teacher_sheet"];
  if (/^מצג(ת|ות)$/.test(t)) return ["presentation"];
  if (/^(בגרות|בגרויות|מבחן|מבחנים)$/.test(t)) return ["past_exam"];
  return [];
}

function hit(token: string, hay: string): boolean {
  if (!hay) return false;
  if (token.length <= 2) return (" " + hay + " ").includes(" " + token + " ");
  // בלי הסרת אות שימוש כללית: "בשלח" ≠ "שלח" (שתי פרשיות שונות). אות שימוש מטופלת רק בסוג הקובץ (kindsOf)
  return hay.includes(token);
}

export type SearchItem = {
  /** כותרת הפריט (חומר או תיקייה) */
  title: string;
  /** כותרות האבות מהשורש ועד האב הישיר (בלי הפריט עצמו, ובחומר: כולל התיקייה שלו) */
  ancestors: string[];
  description?: string | null;
  /** סוג הקובץ (חומרים בלבד) */
  kind?: string;
};

export type Scored = { matched: number; required: number; score: number };

/** דירוג פריט מול שאילתה מפוצלת. matched = כמה מילות חובה נמצאו (required = כמה יש) */
export function scoreItem(tokens: string[], item: SearchItem, fillers: ReadonlySet<string> = FILLER_WORDS): Scored {
  const title = normalize(item.title);
  const leaf = normalize(item.ancestors[item.ancestors.length - 1] ?? "");
  const anc = normalize(item.ancestors.join(" "));
  const desc = normalize(item.description);
  let matched = 0;
  let required = 0;
  let score = 0;
  for (const t of tokens) {
    const filler = fillers.has(t);
    const kindHit = !!item.kind && kindsOf(t).includes(item.kind);
    let s = 0;
    if (hit(t, title)) s = 3;
    else if (kindHit) s = 2.5;
    else if (hit(t, leaf)) s = 2;
    else if (hit(t, anc)) s = 1.5;
    else if (hit(t, desc)) s = 0.8;
    if (filler) {
      score += s > 0 ? 0.3 : 0;
      continue;
    }
    required++;
    if (s > 0) matched++;
    score += s;
  }
  // כל מילות החובה בכותרת הפריט עצמו - עדיפות גבוהה
  if (required > 0 && tokens.filter((t) => !fillers.has(t)).every((t) => hit(t, title))) score += 2;
  return { matched, required, score };
}

/**
 * מסנן ומדרג רשימה. מחזיר את ההתאמות המלאות; אם אין אף אחת ויש 3+ מילות חובה - את ה"קרובות" (חסרה מילה אחת), עם approx=true.
 * `tiebreak` (למשל מספר הורדות) קובע סדר בין ציונים שווים.
 */
export function rankItems<T>(
  query: string,
  items: T[],
  toItem: (x: T) => SearchItem,
  tiebreak: (x: T) => number = () => 0,
): { items: T[]; approx: boolean } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { items: [], approx: false };
  // שאילתה של מילות מילוי בלבד ("פרק") - מתייחסים אליהן כחובה, אחרת לא היה מה לחפש
  const fillers: ReadonlySet<string> = tokens.every((t) => FILLER_WORDS.has(t)) ? new Set<string>() : FILLER_WORDS;
  const scored = items.map((x) => ({ x, ...scoreItem(tokens, toItem(x), fillers) }));
  const byScore = (a: { score: number; x: T }, b: { score: number; x: T }) => b.score - a.score || tiebreak(b.x) - tiebreak(a.x);
  const required = tokens.filter((t) => !fillers.has(t)).length;
  if (required === 0) return { items: [], approx: false };
  const full = scored.filter((s) => s.matched === s.required && s.required > 0).sort(byScore);
  if (full.length > 0) return { items: full.map((s) => s.x), approx: false };
  if (required >= 3) {
    const near = scored.filter((s) => s.matched >= required - 1 && s.matched >= 2).sort(byScore);
    return { items: near.map((s) => s.x), approx: near.length > 0 };
  }
  return { items: [], approx: false };
}
