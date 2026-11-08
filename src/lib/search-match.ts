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
 *  - גרסאות של מילה (ר' needlesOf): כתיב חסר/מלא (תהילים = תהלים, ירמיהו = ירמיה - משווים בלי י/ו שאינן ראשונות),
 *    ריבוי/יחיד ("נביאים" ↔ "נביא"), שמות נרדפים וכינויים ("תנ"ך" ← תורה/נביא/כתובים, "לשון" ← מערכת הצורות/תחביר...),
 *    ומספר באותיות/בספרות ("ג" = "3", "שלוש" = "3"). גרסה שאינה המילה עצמה מדורגת נמוך יותר, כך שהתאמה מדויקת תמיד קודמת.
 *    עדיין בלי הסרת אות שימוש כללית ("בשלח" ≠ "שלח").
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

/** ערך מספרי של מספר עברי תקין עד 999 ("יג" → 13, "נא" → 51); null אם אינו מספר ("בא", "לא תקין") */
export function fromHebrewNumeral(s: string): number | null {
  if (!s || s.length > 4) return null;
  const V: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
  let n = 0;
  let stage = 0; // 0 = מאות, 1 = עשרות, 2 = יחידות
  // 15 ו-16 נכתבים טו / טז (לא יה / יו)
  const tail = /(טו|טז)$/.exec(s);
  if (tail) {
    n = tail[1] === "טו" ? 15 : 16;
    s = s.slice(0, -2);
    stage = 2;
  }
  for (const ch of s) {
    const v = V[ch];
    if (!v) return null;
    const st = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    if (st < stage || (st > 0 && st === stage)) return null; // סדר גבוה→נמוך, עשרות/יחידות לכל היותר פעם אחת
    stage = st;
    n += v;
  }
  return n >= 1 && n <= 999 ? n : null;
}

/**
 * כתיב חסר/מלא: בכל מילה (באורך 3+) מסירים את האות [ch] (י או ו) כשאינה האות הראשונה. "תהילים" ו"תהלים" שוות (בלי י'),
 * "ירמיהו" ו"ירמיה" (בלי ו'). מסירים כל אות בנפרד ולא את שתיהן יחד, כדי שמילים שונות לא יתנגשו ("ספרות" ≠ "ספרית"/"סיפורת").
 * מחילים על שני הצדדים (השאילתה והכותרת).
 */
export function looseBy(text: string, ch: "י" | "ו"): string {
  const re = ch === "י" ? /י/g : /ו/g;
  return text
    .split(" ")
    .map((w) => (w.length >= 3 ? w[0] + w.slice(1).replace(re, "") : w))
    .join(" ");
}
/** תאימות לאחור ולבדיקות: הסרת י/ו יחד (לא משמש בהתאמה עצמה) */
export const loose = (text: string): string => looseBy(looseBy(text, "י"), "ו");

/**
 * שמות נרדפים וכינויים (מפתח ותוצאה מנורמלים: בלי גרשיים/ניקוד). כל ערך הוא "או": מספיק שאחד מהם יופיע.
 * רק כינויים שקיימים באמת בקטלוג או שמורות מחפשות בהם. אין כאן הסרת אות שימוש (ר' הערה בראש הקובץ).
 */
export const ALIASES: Record<string, string[]> = {
  תנך: ["תורה", "נביא", "כתובים"],
  מקרא: ["תורה", "נביא", "כתובים"],
  נך: ["נביא", "כתובים"],
  חומש: ["תורה"],
  חומשים: ["תורה"],
  לשון: ["מערכת הצורות", "תחביר", "הבעה והבנה"],
  דקדוק: ["מערכת הצורות", "תחביר"],
  הלכה: ["דינים"],
  הלכות: ["דינים"],
  הלכתי: ["דינים"],
  הלכתית: ["דינים"],
  דין: ["דינים"],
  דינים: ["הלכות"],
  יהדות: ["מחשבת ישראל"],
  הגות: ["מחשבת ישראל"],
  אנגלית: ["english"],
  english: ["אנגלית"],
  חשבון: ["מתמטיקה"],
  מתמטיקה: ["חשבון"],
  שלוש: ["3"],
  שלושה: ["3"],
  ארבע: ["4"],
  ארבעה: ["4"],
  חמש: ["5"],
  חמישה: ["5"],
  יחידות: ["יחל"],
  יחידה: ["יחל"],
  יחל: ["יחידות"],
};

type Needle = { text: string; weight: number; word?: boolean; stem?: boolean };

const NEEDLE_CACHE = new Map<string, Needle[]>();

/** ריבוי זכר: מסירים "ים" כשנשאר שורש של 3+ אותיות (נביאים → נביא). בכוונה לא "ות" ("ספרות" → "ספר" היא מילה אחרת); שורש של עד 4 אותיות מתאים רק כמילה שלמה (ר' hitWeight). בלי אות שימוש בתחילת המילה */
function stemsOf(t: string): string[] {
  const out: string[] = [];
  for (const suf of ["ים"]) {
    if (t.endsWith(suf) && t.length - suf.length >= 3) {
      out.push(t.slice(0, -suf.length));
      break;
    }
  }
  return out;
}

/** כל הגרסאות שמילת חיפוש מתאימה להן, עם משקל (1 = המילה עצמה). נשמר במטמון קטן */
export function needlesOf(token: string): Needle[] {
  const hit = NEEDLE_CACHE.get(token);
  if (hit) return hit;
  const out: Needle[] = [{ text: token, weight: 1 }];
  const seen = new Set([token]);
  const add = (text: string, weight: number, word?: boolean, stem?: boolean) => {
    const key = (word ? "w:" : "") + text;
    if (!text || seen.has(key) || (seen.has(text) && !word)) return;
    seen.add(key);
    out.push({ text, weight, ...(word ? { word: true } : {}), ...(stem ? { stem: true } : {}) });
  };
  for (const st of stemsOf(token)) add(st, 0.9, false, true);
  for (const base of [token, ...stemsOf(token)]) for (const al of ALIASES[base] ?? []) add(normalize(al), 0.7);
  // מספר: "ג" ↔ "3", "יג" ↔ "13" (בכותרות כמו "בגרות 3 יחידות") - מילה שלמה בלבד
  const num = token.length <= 3 ? fromHebrewNumeral(token) : null;
  if (num !== null) add(String(num), 0.95, true);
  if (NEEDLE_CACHE.size > 800) NEEDLE_CACHE.clear();
  NEEDLE_CACHE.set(token, out);
  return out;
}

type Prep = { t: string; ly: string; lv: string };
const prep = (s: string | null | undefined): Prep => {
  const t = normalize(s);
  return { t, ly: looseBy(t, "י"), lv: looseBy(t, "ו") };
};

/** משקל ההתאמה הטובה ביותר של מילה (בכל גרסאותיה) בשדה; 0 = אין */
function hitWeight(token: string, h: Prep): number {
  if (!h.t) return 0;
  let best = 0;
  for (const n of needlesOf(token)) {
    let w = 0;
    if (n.word || n.text.length <= 2 || (n.stem && n.text.length < 5)) {
      // מילה קצרה (מספר פרק, "בא") חייבת להופיע כמילה שלמה
      w = (" " + h.t + " ").includes(" " + n.text + " ") ? n.weight : 0;
    } else if (h.t.includes(n.text)) {
      // בלי הסרת אות שימוש כללית: "בשלח" ≠ "שלח" (שתי פרשיות שונות). אות שימוש מטופלת רק בסוג הקובץ (kindsOf)
      w = n.weight;
    } else if (!(n.stem && n.text.length < 5)) {
      // כתיב חסר/מלא. שורש קצר (עד 4 אותיות) לא משווים בכתיב חסר; מילה שנשארו בה 3 אותיות ("משל" ← משלי) רק כמילה שלמה, לא כתת-מחרוזת ("ממשלה")
      for (const [ln, hay] of [[looseBy(n.text, "י"), h.ly], [looseBy(n.text, "ו"), h.lv]] as const) {
        if (ln.length < 3) continue;
        const ok = ln.length < 4 ? (" " + hay + " ").includes(" " + ln + " ") : hay.includes(ln);
        if (ok) {
          w = n.weight * 0.95;
          break;
        }
      }
    }
    if (w > best) best = w;
  }
  return best;
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
  const title = prep(item.title);
  const leaf = prep(item.ancestors[item.ancestors.length - 1] ?? "");
  const anc = prep(item.ancestors.join(" "));
  const desc = prep(item.description);
  let matched = 0;
  let required = 0;
  let score = 0;
  for (const t of tokens) {
    const filler = fillers.has(t);
    const kindHit = !!item.kind && kindsOf(t).includes(item.kind);
    const s = Math.max(
      3 * hitWeight(t, title),
      kindHit ? 2.5 : 0,
      2 * hitWeight(t, leaf),
      1.5 * hitWeight(t, anc),
      0.8 * hitWeight(t, desc),
    );
    if (filler) {
      score += s > 0 ? 0.3 : 0;
      continue;
    }
    required++;
    if (s > 0) matched++;
    score += s;
    // כותרת הפריט היא בדיוק המילה (או אחד מכינוייה): "נביא" → הצומת "נביא" לפני "דבורה הנביאה", "תנ"ך" → תורה/נביא/כתובים
    if (title.t && needlesOf(t).some((n) => n.text === title.t)) score += 1.5;
  }
  // כל מילות החובה בכותרת הפריט עצמו - עדיפות גבוהה
  if (required > 0 && tokens.filter((t) => !fillers.has(t)).every((t) => hitWeight(t, title) > 0)) score += 2;
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

// ---- מקלדת: שאילתה שהוקלדה בפריסה הלא נכונה ----

/** פריסת המקלדת העברית הסטנדרטית (SI-1452): מקש באנגלית → האות שהוא מקליד בעברית */
const EN_TO_HE: Record<string, string> = {
  q: "/", w: "'", e: "ק", r: "ר", t: "א", y: "ט", u: "ו", i: "ן", o: "ם", p: "פ",
  a: "ש", s: "ד", d: "ג", f: "כ", g: "ע", h: "י", j: "ח", k: "ל", l: "ך", ";": "ף", "'": ",",
  z: "ז", x: "ס", c: "ב", v: "ה", b: "נ", n: "מ", m: "צ", ",": "ת", ".": "ץ", "/": ".",
};
const HE_TO_EN: Record<string, string> = Object.fromEntries(Object.entries(EN_TO_HE).map(([en, he]) => [he, en]));

/**
 * שאילתות חלופיות למי ששכחה להחליף שפה במקלדת (או שהייתה נעולה ב-CAPS LOCK באנגלית):
 *  - רק אותיות לטיניות ("akuo", "TEKNV") ← אותן לחיצות בעברית ("שלום", "תורה"). אותיות גדולות (CAPS LOCK) מומרות כקטנות.
 *  - רק אותיות עבריות ("קמעךןדי") ← אותן לחיצות באנגלית ("english"), למי שרצתה לכתוב באנגלית והמקלדת הייתה בעברית.
 * ספרות ורווחים נשארים. מחזיר רשימה ריקה כשהשאילתה מעורבת (עברית+אנגלית) או שההמרה זהה למקור.
 */
export function keyboardAlternates(query: string): string[] {
  const q = query.trim();
  const hasHe = /[א-ת]/.test(q);
  const hasLat = /[a-z]/i.test(q);
  if (hasLat === hasHe) return [];
  const conv = hasLat
    ? [...q.toLowerCase()].map((c) => EN_TO_HE[c] ?? c).join("")
    : [...q].map((c) => HE_TO_EN[c] ?? c).join("");
  return conv !== q ? [conv] : [];
}
