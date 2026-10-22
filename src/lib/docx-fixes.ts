import "server-only";
import JSZip from "jszip";

/**
 * החלת תיקונים על קובץ Word (הקובץ השמור לא משתנה לעולם). שני מצבים:
 *  - "marked" – לצפייה באתר: כל הדף מוצג במלואו, והטקסט המקורי מסומן בזהב ומיד אחריו התיקון בתכלת, עם מספר התיקון לידו.
 *  - "clean"  – להורדה: הטקסט המקורי מוחלף בתיקון, בנראות רגילה לגמרי (בלי צבע ובלי מספרים).
 * מספרי התיקונים מוצגים באתר בלבד – לא נכנסים לקובץ בשום מצב.
 */

export type FixMode = "marked" | "clean";

export type DocxFix = {
  id: number;
  originalText: string;
  correctedText: string;
  /** מספר התיקון כפי שמוצג ברשימה – מודפס ליד התיקון בתצוגה בלבד (mode "marked") */
  number?: number;
  /**
   * כשהטקסט מופיע כמה פעמים במסמך: כמה מופעים שלו קדמו למקום שהמורה סימנה (מאפס). חסר/0 = המופע הראשון.
   * נספר על הטקסט הדחוס (בלי רווחים וניקוד), בסדר הפסקאות של ה-docx.
   */
  occurrence?: number;
};

/** הטקסט בלי רווחים/ניקוד – להשוואה בין מה שהמורה סימנה לטקסט שהסוכן הציע */
export function compactText(s: string): string {
  return compactWithMap(norm(s.trim())).out;
}

export type ApplyFixesResult = {
  bytes: Uint8Array;
  /** id של תיקונים שנמצא להם מקום בקובץ */
  applied: number[];
  /** id של תיקונים שהטקסט המקורי שלהם לא נמצא (או חופף לתיקון אחר) */
  missing: number[];
};

const PINK = "E9D08A"; // הצבע של הטעות
const BLUE = "9AC7BC"; // הצבע של התיקון

const TEXT_RUN =
  /^<w:r(?:\s[^>]*)?>(<w:rPr>[\s\S]*?<\/w:rPr>|<w:rPr\/>)?((?:<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:t\/>)+)<\/w:r>$/;
const RUN_SPLIT = /(<w:r(?=[\s>])[\s\S]*?<\/w:r>)/;
const PARAGRAPH = /<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g;
/** אלמנטים שאחריהם (לפי סכמת Word) מותר להוסיף w:shd – לפי סדר התקן */
const AFTER_SHD = ["w:fitText", "w:vertAlign", "w:rtl", "w:cs", "w:em", "w:lang", "w:eastAsianLayout", "w:specVanish", "w:oMath"];

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function encodeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** נרמול תו-לתו (אורך זהה!) כדי שגרשיים/רווחים שונים לא ימנעו התאמה */
function norm(s: string) {
  return s
    .replace(/[“”״„]/g, '"')
    .replace(/[‘’׳]/g, "'")
    .replace(/[   ]/g, " ")
    .replace(/[–—־]/g, "-");
}

/** ניקוד וטעמים (U+0591–U+05C7) */
const NIKUD = /[֑-ׇ]/;
/** תווים שמתעלמים מהם בהתאמה הדחוסה: רווחים, ניקוד/טעמים, וסימוני כיווניות */
const IGNORED_IN_MATCH = /[\s֑-ׇ‎‏‪-‮]/;

/** הטקסט בלי התווים המתעלמים + מיפוי מכל אינדקס בו לאינדקס המקורי (אורך המקור נשמר לעריכה) */
function compactWithMap(s: string): { out: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (IGNORED_IN_MATCH.test(s[i])) continue;
    out += s[i];
    map.push(i);
  }
  return { out, map };
}

type Token =
  | { kind: "raw"; xml: string }
  | { kind: "text"; rPr: string; text: string; start: number };

function withShading(rPr: string, fill: string): string {
  const shd = `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
  let inner = rPr.replace(/^<w:rPr\/?>/, "").replace(/<\/w:rPr>$/, "");
  inner = inner.replace(/<w:shd\b[^>]*\/>/g, "").replace(/<w:highlight\b[^>]*\/>/g, "");
  let at = inner.length;
  for (const tag of AFTER_SHD) {
    const i = inner.search(new RegExp(`<${tag}(?=[\\s/>])`));
    if (i >= 0 && i < at) at = i;
  }
  return `<w:rPr>${inner.slice(0, at)}${shd}${inner.slice(at)}</w:rPr>`;
}

function textRun(rPr: string, text: string, fill?: string) {
  const props = fill ? withShading(rPr || "<w:rPr/>", fill) : rPr;
  const parts = text.split("\n");
  const body = parts
    .map((p) => `<w:t xml:space="preserve">${encodeXml(p)}</w:t>`)
    .join("<w:br/>");
  return `<w:r>${props}${body}</w:r>`;
}

/** מספר התיקון: קטן, מודגש ומורם, בכחול כהה – ליד התיקון */
function numberRun(n: number) {
  return `<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="16244E"/><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve"> ${n}</w:t></w:r>`;
}

function tokenize(paragraph: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  for (const piece of paragraph.split(RUN_SPLIT)) {
    if (!piece) continue;
    const m = TEXT_RUN.exec(piece);
    if (m) {
      const text = [...m[2].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => decodeXml(x[1])).join("");
      tokens.push({ kind: "text", rPr: m[1] ?? "", text, start: offset });
      offset += text.length;
    } else {
      tokens.push({ kind: "raw", xml: piece });
    }
  }
  return tokens;
}

type Edit = { fix: DocxFix; start: number; end: number };

/** בונה מחדש פסקה אחת עם כל העריכות שלה (העריכות לא חופפות וממוינות) */
function rebuild(tokens: Token[], edits: Edit[], mode: FixMode): string {
  const out: string[] = [];
  const editRPr = new Map<Edit, string>();
  for (const tok of tokens) {
    if (tok.kind === "raw") {
      out.push(tok.xml);
      continue;
    }
    const tStart = tok.start;
    const tEnd = tok.start + tok.text.length;
    const cuts = new Set<number>([tStart, tEnd]);
    for (const e of edits) {
      for (const c of [e.start, e.end]) if (c > tStart && c < tEnd) cuts.add(c);
    }
    const points = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a === b) continue;
      const piece = tok.text.slice(a - tStart, b - tStart);
      const inEdit = edits.find((e) => a >= e.start && b <= e.end);
      if (inEdit) {
        if (!editRPr.has(inEdit)) editRPr.set(inEdit, tok.rPr);
        if (mode === "marked") out.push(textRun(tok.rPr, piece, PINK));
      } else {
        out.push(textRun(tok.rPr, piece));
      }
      const finished = edits.find((e) => e.end === b);
      if (finished && inEdit === finished) {
        if (mode === "marked") {
          out.push(textRun("", " "));
          out.push(textRun(editRPr.get(finished) ?? tok.rPr, finished.fix.correctedText, BLUE));
          if (finished.fix.number != null) out.push(numberRun(finished.fix.number));
        } else {
          out.push(textRun(editRPr.get(finished) ?? tok.rPr, finished.fix.correctedText));
        }
      }
    }
  }
  return out.join("");
}

/** מחיל את התיקונים (לפי הסדר) על מסמך Word. תיקון שהטקסט שלו לא נמצא – מדלגים עליו ומדווחים. */
export async function applyDocxFixes(
  input: Uint8Array,
  fixes: DocxFix[],
  mode: FixMode = "clean",
): Promise<ApplyFixesResult> {
  const zip = await JSZip.loadAsync(input);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return { bytes: input, applied: [], missing: fixes.map((f) => f.id) };
  const xml = await docFile.async("string");

  const wanted = fixes.filter((f) => f.originalText.trim() && f.correctedText.trim());
  const found = new Map<number, Edit[]>(); // אינדקס פסקה → עריכות
  const applied = new Set<number>();
  const paragraphs = [...xml.matchAll(PARAGRAPH)];
  const paraTokens = paragraphs.map((p) => tokenize(p[0]));
  const paraText = paraTokens.map((t) =>
    norm(t.map((x) => (x.kind === "text" ? x.text : "")).join("")),
  );
  // התאמה "דחוסה": בלי רווחים ובלי ניקוד – הטקסט שמורה מסמנת בתצוגת ה-PDF מגיע משכבת הטקסט של ה-PDF,
  // שם רווחים, ניקוד וסדר הניקוד לא תמיד זהים ל-docx ("כוונהלמשפחת" מול "כוונה למשפחת")
  const paraCompact = paraText.map(compactWithMap);

  /** כל ההתאמות (בלי חפיפה) של הטקסט הדחוס בפסקה אחת, בסדר הופעתן */
  const compactMatches = (pi: number, needleCompact: string) => {
    const { out, map } = paraCompact[pi];
    const res: { start: number; end: number }[] = [];
    let from = 0;
    for (let ci = out.indexOf(needleCompact, from); ci >= 0; ci = out.indexOf(needleCompact, from)) {
      const start = map[ci];
      let end = map[ci + needleCompact.length - 1] + 1;
      while (end < paraText[pi].length && NIKUD.test(paraText[pi][end])) end++;
      res.push({ start, end });
      from = ci + needleCompact.length;
    }
    return res;
  };

  for (const fix of wanted) {
    const needle = norm(fix.originalText.trim());
    const needleCompact = compactWithMap(needle).out;

    // המורה סימנה מופע מסוים כשהטקסט חוזר כמה פעמים (occurrence = כמה מופעים קדמו לו, מאפס) – מחליפים אותו ולא את הראשון
    if ((fix.occurrence ?? 0) > 0 && needleCompact.length >= 2) {
      let seen = 0;
      let first: { pi: number; start: number; end: number } | null = null;
      let chosen: { pi: number; start: number; end: number } | null = null;
      for (let pi = 0; pi < paraText.length && !chosen; pi++) {
        for (const m of compactMatches(pi, needleCompact)) {
          if (!first) first = { pi, ...m };
          if (seen === fix.occurrence) {
            chosen = { pi, ...m };
            break;
          }
          seen++;
        }
      }
      const target = chosen ?? first; // פחות מופעים מהצפוי (הקובץ השתנה?) – לפחות הראשון
      if (target) {
        const existing = found.get(target.pi) ?? [];
        if (!existing.some((e) => target.start < e.end && target.end > e.start)) {
          existing.push({ fix, start: target.start, end: target.end });
          found.set(target.pi, existing);
          applied.add(fix.id);
        }
      }
      continue;
    }

    for (let pi = 0; pi < paraText.length; pi++) {
      let start = paraText[pi].indexOf(needle);
      let end = start + needle.length;
      if (start < 0) {
        if (needleCompact.length < 2) continue;
        const { out, map } = paraCompact[pi];
        const ci = out.indexOf(needleCompact);
        if (ci < 0) continue;
        start = map[ci];
        end = map[ci + needleCompact.length - 1] + 1;
        // הניקוד שצמוד לאות האחרונה שייך לה – נכלל בטווח המוחלף
        while (end < paraText[pi].length && NIKUD.test(paraText[pi][end])) end++;
      }
      const existing = found.get(pi) ?? [];
      if (existing.some((e) => start < e.end && end > e.start)) continue; // חופף לתיקון אחר – מנסים התאמה אחרת
      existing.push({ fix, start, end });
      found.set(pi, existing);
      applied.add(fix.id);
      break;
    }
  }

  if (applied.size === 0) {
    return { bytes: input, applied: [], missing: fixes.map((f) => f.id) };
  }

  let result = "";
  let last = 0;
  paragraphs.forEach((p, pi) => {
    const edits = found.get(pi);
    if (!edits) return;
    const idx = p.index ?? 0;
    result += xml.slice(last, idx);
    const open = /^<w:p(?=[\s>])[^>]*>/.exec(p[0])![0];
    const inner = p[0].slice(open.length, p[0].length - "</w:p>".length);
    // ה-rPr/pPr של הפסקה עצמה נשארים כחלק מהטוקנים ה-raw
    edits.sort((a, b) => a.start - b.start);
    result += open + rebuild(tokenize(inner), edits, mode) + "</w:p>";
    last = idx + p[0].length;
  });
  result += xml.slice(last);

  zip.file("word/document.xml", result);
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    bytes,
    applied: [...applied],
    missing: fixes.filter((f) => !applied.has(f.id)).map((f) => f.id),
  };
}

export function isDocxName(fileName: string) {
  return /\.docx$/i.test(fileName);
}
