/**
 * תיקון בזמן-הגשה לקווי-מילוי ("____") בדפי תלמידה, לפני ההמרה ל-PDF.
 *
 * הבעיה (אומתה ברינדור, 2026-10-20, ~330 קובצי docx בכל המסלולים): פסקה מיושרת לשני הצדדים
 * (`<w:jc w:val="both"/>`) שמכילה ריצה אחת ארוכה של קווים תחתונים (38-94 תווים, מילה אחת
 * בלתי-שבירה, רחבה מהשורה). LibreOffice (שרת Oracle) וגם Word דוחפים את ריצת הקווים לשורה הבאה,
 * והשארית הקצרה שלפניה ("לפי רש"י -") נמתחת על כל רוחב השורה - שורות מכוערות עם רווחי ענק.
 *
 * הפתרון: מסירים את יישור-לשני-הצדדים *רק* מפסקאות שיש בהן ריצת קווים תחתונים ארוכה (≥ 8).
 * בכוונה לא כותבים `w:val="right"/"left"` (כלל הפרויקט: תחת `<w:bidi/>` לעולם לא כותבים
 * left/right) - הסרת האלמנט נותנת לפסקה לרשת את יישור-ההתחלה (start) של הסגנון/הכיוון.
 * פסקאות טקסט רגילות (תקציר, הסבר) נשארות מיושרות לשני הצדדים כפי שנבנו.
 *
 * בעיה שנייה (אומתה 2026-10-22 מול ה-PDF שהמורה הורידה, "דף לתלמידה - גדעון" שבדרייב, וקיימת
 * ב-11 דפי-תלמידה שבדרייב): "חור" במשפט-מילוי שנבנה **מרווחים בלבד** - ריצה של 4-18 רווחים במקום
 * המילה שהושמטה, בלי קו תחתון ובלי קווים תחתונים (`<w:t>         </w:t>` בין "אם יבינו " ל-" באה").
 * ב-Word זה נראה כרווח ריק, ובהמרה ל-PDF (ובמיוחד בפסקה מיושרת לשני הצדדים) המילים זזות והמשפט
 * נקרא כמשובש: "אם יבינו באה בגלל זרה, יוכלו בתשובה באמת" - אין שום סימן שחסרה שם מילה למילוי.
 * כלל הפרויקט (CLAUDE.md: "always use literal underscore characters") - ולכן בזמן-הגשה ממירים
 * ריצת-רווחים כזו לקווים תחתונים באותו אורך, **רק** כשהיא יושבת במקום של מילה במשפט: טקסט נראה
 * לפניה שמסתיים ברווח, ואחריה - באותה פסקה - או טקסט שמתחיל ברווח או כלום (המילה האחרונה במשפט
 * הושמטה). ריצות-רווחים אחרות נשארות כמו שהן: ריווח בין "שם: ____" ל-"תאריך:" בבחנים, הזחה
 * בתחילת פסקה, רווח בין פריטי "התאמה: 1-(___)     2-(___)", רווחים אחרי נקודה/סוגריים - כולן
 * נבדקו בסריקת הקורפוס (2,221 docx מקומיים + 1,085 בגיבוי מצב-הדרייב) ואינן עונות לכלל; הכלל תפס
 * שם בדיוק את 11 דפי-התלמידה הפגומים (ואת "דגם איך נראה בוחן").
 *
 * למה בזמן-הגשה ולא תיקון הקבצים בדרייב: זה מתקן מיד את כל הקבצים החיים בלי העלאה מחדש של
 * מאות קבצים (ר' "The local file here is NOT what the live site serves" ב-CLAUDE.md). הקובץ
 * המקורי בדרייב לא משתנה; רק הבייטים שנשלחים להמרה. אין כאן "server-only" בכוונה - נקרא
 * מ-driveBridgeCore.ts שסקריפטים עצמאיים (scripts/*.ts) מייבאים ישירות מחוץ ל-Next.
 */

import JSZip from "jszip";

/** מכמה קווים תחתונים רצופים (כולל ריצה שנקטעת ב-tab) פסקה נחשבת "שורת מילוי" */
const MIN_UNDERSCORES = 8;

/** מכמה רווחים רצופים ריצה-של-רווחים-בלבד בין מילים נחשבת "חור למילוי" (הקצר ביותר שנמצא בקורפוס: 4) */
const MIN_SPACE_BLANK = 4;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** האם המסמך הוא docx (לא pptx/doc) - לפי ה-mime או הסיומת; רק עליו מריצים את התיקון */
export function isDocxForBlankLines(mimeType: string, name: string) {
  return mimeType === DOCX_MIME || /\.docx$/i.test(name);
}

/**
 * תג פתיחה/סגירה של פסקה: `<w:p>`, `<w:p ...>`, `<w:p/>` ו-`</w:p>`. ה-lookahead מונע התאמה
 * ל-`<w:pPr>`, `<w:pStyle>`, `<w:pgSz>`, `<w:pict>`, `<w:proofErr>` וכו'.
 */
const P_TAG = /<\/?w:p(?=[\s>/])[^>]*>/g;

/** `<w:jc w:val="both"/>` (או distribute) - עם/בלי מאפיינים נוספים, עצמי-סוגר או עם תג סגירה */
const JC_JUSTIFY = /<w:jc\s[^>]*?w:val="(?:both|distribute)"[^>]*?(?:\/>|>\s*<\/w:jc>)/;

/** הטקסט הנראה של קטע XML: `<w:t>` בלבד (לא delText/instrText); `<w:tab/>` לא קוטע ריצת קווים */
function visibleText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
}

/**
 * הליבה: מקבל את word/document.xml ומחזיר אותו אחרי הסרת `<w:jc both>` מפסקאות-מילוי,
 * או null אם אין מה לשנות. טהור וסינכרוני - נוח לבדיקות ולסקריפטים.
 *
 * עובד עם מחסנית תגי-פסקה (ולא regex פסקה-שלמה), כי פסקאות מקננות בפועל: תיבת-טקסט
 * (`<w:txbxContent>`) יושבת בתוך ריצה של פסקה חיצונית. כל פסקה מוערכת לפי הטקסט *שלה*
 * (בלי פסקאות-ילד), ונוגעים רק ב-`<w:pPr>` הישיר שלה - לעולם לא ב-jc של טבלה/מקטע/סגנון.
 */
export function relaxJustifiedBlankLinesXml(xml: string): string | null {
  const underscoreRun = new RegExp(`_{${MIN_UNDERSCORES},}`);
  // מחסנית הפסקאות הפתוחות: תחילת התג + טווחי פסקאות-ילד שכבר נסגרו
  const open: { start: number; openEnd: number; children: [number, number][] }[] = [];
  const cuts: [number, number][] = []; // טווחי `<w:jc .../>` להסרה

  for (const m of xml.matchAll(P_TAG)) {
    const tag = m[0];
    const at = m.index ?? 0;
    if (tag.startsWith("</")) {
      const p = open.pop();
      if (!p) continue; // XML לא מאוזן - לא נוגעים
      const end = at + tag.length;
      // הטקסט של הפסקה עצמה, בלי פסקאות מקוננות (תיבות טקסט)
      let own = "";
      let cursor = p.openEnd;
      for (const [cs, ce] of p.children) {
        own += xml.slice(cursor, cs);
        cursor = ce;
      }
      own += xml.slice(cursor, at);
      if (underscoreRun.test(visibleText(own))) {
        // ה-pPr של הפסקה חייב (לפי הסכמה) להיות הילד הראשון מיד אחרי תג הפתיחה
        const body = xml.slice(p.openEnd, at);
        const pPrOpen = /^\s*<w:pPr(?=[\s>])[^>]*>/.exec(body);
        if (pPrOpen) {
          const pPrEnd = body.indexOf("</w:pPr>", pPrOpen[0].length);
          if (pPrEnd > 0) {
            let seg = body.slice(pPrOpen[0].length, pPrEnd);
            // שינויים-במעקב: `<w:pPrChange>` מכיל pPr ישן משלו - לא נוגעים בו
            const chg = seg.indexOf("<w:pPrChange");
            if (chg >= 0) seg = seg.slice(0, chg);
            const jc = JC_JUSTIFY.exec(seg);
            if (jc) {
              const s = p.openEnd + pPrOpen[0].length + (jc.index ?? 0);
              cuts.push([s, s + jc[0].length]);
            }
          }
        }
      }
      open[open.length - 1]?.children.push([p.start, end]);
      continue;
    }
    if (tag.endsWith("/>")) continue; // `<w:p/>` - פסקה ריקה
    open.push({ start: at, openEnd: at + tag.length, children: [] });
  }

  if (cuts.length === 0) return null;
  // פסקה מקוננת נסגרת לפני החיצונית שלה, אז הטווחים לא בהכרח ממוינים
  cuts.sort((a, b) => a[0] - b[0]);
  let out = "";
  let last = 0;
  for (const [s, e] of cuts) {
    out += xml.slice(last, s);
    last = e;
  }
  return out + xml.slice(last);
}

/** אסימוני ה-XML שמעניינים את fillSpaceBlanksXml: תגי פסקה (פתיחה/סגירה/ריקה) ו-`<w:t>` שלם עם הטקסט שלו */
const BLANK_TOKENS = /<\/?w:p(?=[\s>/])[^>]*>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

/**
 * "חור" שנבנה מרווחים בלבד → קווים תחתונים באותו אורך (ר' ההסבר בראש הקובץ). מחזיר null אם אין
 * מה לשנות. התנאים, כולם חובה:
 *  - `<w:t>` שכל תוכנו רווחים (U+0020), לפחות MIN_SPACE_BLANK;
 *  - באותה פסקה (בלי לחצות תג פסקה - גם לא של תיבת-טקסט מקוננת) יש טקסט נראה לפניה שמסתיים
 *    ברווח; ואחריה - או טקסט נראה שמתחיל ברווח, או שום טקסט נראה (סוף הפסקה - המילה האחרונה
 *    הושמטה) - כלומר הריצה יושבת במקום של מילה בתוך משפט. ריצה שלפניה נקודה/סוגר/קו תחתון או
 *    שאחריה מילה צמודה (ריווח בין פריטים, "שם: ____    תאריך:") לא נחשבת.
 * קו תחתון (`<w:u>`) על הריצה לא משנה: גם ריצת-רווחים מקווקוות נעלמת בגבול שבירת-שורה (CLAUDE.md,
 * 2026-09-14), וקווים תחתונים ממילא נראים זהה לה.
 */
export function fillSpaceBlanksXml(xml: string): string | null {
  type Tok = { kind: "p" | "t"; start: number; end: number; text: string };
  const toks: Tok[] = [];
  for (const m of xml.matchAll(BLANK_TOKENS)) {
    const s = m[0];
    const start = m.index ?? 0;
    const kind: Tok["kind"] = s.startsWith("<w:t") ? "t" : "p";
    toks.push({ kind, start, end: start + s.length, text: kind === "t" ? m[1] : "" });
  }
  const blankRe = new RegExp(`^ {${MIN_SPACE_BLANK},}$`);
  const cuts: [number, number, string][] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "t" || !blankRe.test(t.text)) continue;
    // הטקסט הנראה לפני/אחרי בתוך אותה פסקה
    let before = "";
    for (let j = i - 1; j >= 0 && toks[j].kind !== "p"; j--) if (toks[j].kind === "t") before = toks[j].text + before;
    if (!/\S/.test(before) || !/\s$/.test(before)) continue;
    let after = "";
    for (let j = i + 1; j < toks.length && toks[j].kind !== "p"; j++) if (toks[j].kind === "t") after += toks[j].text;
    if (/\S/.test(after) && !/^\s/.test(after)) continue;
    // רק את הטקסט שבתוך התג מחליפים; התג עצמו (עם xml:space) נשאר
    const textStart = t.end - "</w:t>".length - t.text.length;
    cuts.push([textStart, textStart + t.text.length, "_".repeat(t.text.length)]);
  }
  if (cuts.length === 0) return null;
  let out = "";
  let last = 0;
  for (const [s, e, rep] of cuts) {
    out += xml.slice(last, s) + rep;
    last = e;
  }
  return out + xml.slice(last);
}

/**
 * שני התיקונים יחד, בסדר הזה: קודם חורים-מרווחים → קווים תחתונים (כך פסקה שהחור שלה ארוך דיו
 * נחשבת מיד "שורת מילוי"), ואז שחרור היישור-לשני-הצדדים. מחזיר null אם אף אחד מהם לא שינה דבר.
 */
export function fixBlankLinesXml(xml: string): string | null {
  const filled = fillSpaceBlanksXml(xml);
  const relaxed = relaxJustifiedBlankLinesXml(filled ?? xml);
  return relaxed ?? filled;
}

/**
 * docx → docx עם word/document.xml מתוקן (fixBlankLinesXml: חורים-מרווחים + שחרור יישור). מחזיר
 * את הבייטים *המקוריים* (אותו אובייקט) אם אין מה לשנות בקובץ או אם משהו נכשל - לעולם לא זורק,
 * כדי שתקלה כאן לא תפיל הורדה/תצוגה.
 * שאר רכיבי ה-zip (סגנונות, כותרות עליונות/תחתונות, מדיה) מועתקים כמו שהם; כותרות
 * עליונות/תחתונות (header*.xml/footer*.xml) לא נבדקות בכוונה.
 * תומך גם בנתיב עם backslash ("word\document.xml") שמופיע בחלק מהקבצים שנבנו ע"י סקריפט
 * (ר' normalizeDocxZipPaths ב-driveBridgeCore - רץ אחרי הפונקציה הזו).
 */
export async function relaxJustifiedBlankLines(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const entryName = ["word/document.xml", "word" + String.fromCharCode(92) + "document.xml"].find((n) => zip.file(n));
    if (!entryName) return bytes;
    const entry = zip.file(entryName)!;
    const xml = await entry.async("string");
    const patched = fixBlankLinesXml(xml);
    if (patched === null) return bytes;
    // החלפה במקום - שומרת את מיקום הרשומה בסדר ה-zip. חובה לשמר את ה-date המקורי: ברירת המחדל של JSZip
    // היא new Date(), ואז הבייטים (ומפתח המטמון md5 שנגזר מהם) משתנים בכל בקשה. createFolders:false -
    // שלא תתווסף רשומת תיקייה "word/" לקבצים שנשמרו ב-Word.
    zip.file(entryName, patched, { date: entry.date, createFolders: false });
    return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  } catch (e) {
    console.warn("[docx-blank-lines] התיקון נכשל, ממירים את המקור:", e instanceof Error ? e.message : e);
    return bytes;
  }
}
