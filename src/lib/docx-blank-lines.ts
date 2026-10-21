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
 * למה בזמן-הגשה ולא תיקון הקבצים בדרייב: זה מתקן מיד את כל הקבצים החיים בלי העלאה מחדש של
 * מאות קבצים (ר' "The local file here is NOT what the live site serves" ב-CLAUDE.md). הקובץ
 * המקורי בדרייב לא משתנה; רק הבייטים שנשלחים להמרה. אין כאן "server-only" בכוונה - נקרא
 * מ-driveBridgeCore.ts שסקריפטים עצמאיים (scripts/*.ts) מייבאים ישירות מחוץ ל-Next.
 */

import JSZip from "jszip";

/** מכמה קווים תחתונים רצופים (כולל ריצה שנקטעת ב-tab) פסקה נחשבת "שורת מילוי" */
const MIN_UNDERSCORES = 8;

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

/**
 * docx → docx עם word/document.xml מתוקן. מחזיר את הבייטים *המקוריים* (אותו אובייקט) אם אין
 * פסקאות כאלה בקובץ או אם משהו נכשל - לעולם לא זורק, כדי שתקלה כאן לא תפיל הורדה/תצוגה.
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
    const patched = relaxJustifiedBlankLinesXml(xml);
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
