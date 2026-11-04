# מערכת החיבור לג'מיני – תיעוד מלא להעברה

מסמך עצמאי: אפשר לתת אותו כמו שהוא למערכת AI אחרת (או למפתחת), והיא תוכל לבנות ממנו חיבור לג'מיני עם מאגר מפתחות, סבב מודלים והתקררות חכמה. בסוף המסמך מצורפים **הקוד המלא** (מנוע ניד ללא תלויות) ו**הבדיקות המלאות** שלו.

> אין במסמך מפתחות אמיתיים, ואסור להדביק לתוכו מפתחות. מפתחות נשמרים רק במשתני סביבה או מוצפנים בבסיס נתונים.

---

## 1. מה המערכת עושה ולמה

הבעיה: מפתח ג'מיני בודד נתקע במכסה (429), נחסם (403) או שהמודל עמוס (503). המערכת מחזיקה **מאגר מפתחות** ו**רשימת מודלים מסודרת**, ולכל קריאה מנסה אוטומטית שילוב אחר עד שמתקבלת תשובה תקינה. הקורא מקבל פונקציה אחת, `generate(...)`, ולא צריך לדעת איזה מפתח או מודל ענו.

שלוש מערכות של אותה בעלים משתמשות באותה לוגיקה (כל אחת פורט של קודמתה):

| מערכת | קובץ | הערה |
|---|---|---|
| print-center (מדפיס בוט) | `lib/ai.js` | המקור. סבב מפתחות פשוט, בלי התקררות, מפתח ב-URL |
| אתר האימון הפונקציונלי | `api/_gemini.js` | הוסיפה התקררות, סטטיסטיקה, `accept`, דדליין, בדיקת מפתחות, מפתח בכותרת |
| אתר חומרי הבגרות | `src/lib/gemini-pool.ts` | פורט TypeScript של הגרסה המשופרת, עם שמירת מפתחות מוצפנת ב-DB ודף ניהול |

הגרסה בסוף המסמך (`gemini-pool-portable.mjs`) היא הגרסה המשופרת בלי תלות בשום מסגרת.

## 2. האלגוריתם (בדיוק)

```
generate(בקשה):
  keys = מפתחות (env ← אחרת מקור חלופי כמו DB)       # נשמר במטמון דקה
  deadline = עכשיו + timeoutMs (ברירת מחדל 40 שנ')
  לכל model ברשימה (שלא פג תוקפו):
    לכל key (מתחילים מהמפתח שאחרי האחרון שהצליח):
      דלג אם המפתח בהתקררות, או שהזוג (מפתח, מודל) בהתקררות
      אם נשאר פחות מ-2 שנ' לדדליין, או 4 דחיות accept: עצור
      שלח בקשה (timeout לבקשה: הקטן מבין מה שנשאר ל-25 שנ')
      לפי התוצאה:  ראו טבלה
  אם הכול נכשל: זרוק שגיאה עם attempts (+ rejectedText)
```

| תוצאה | פעולה |
|---|---|
| 200 עם טקסט, ו-`accept` (אם הוגדר) אישר | **החזרה**; המפתח הבא יהיה נקודת ההתחלה של הקריאה הבאה (פיזור עומס) |
| 200 עם טקסט ש-`accept` דחה | שומרים `rejectedText`, ממשיכים; אחרי שתי דחיות באותו מודל, עוברים למודל הבא; אחרי 4 דחיות בסך הכול, עוצרים |
| 200 בלי טקסט (חסימת בטיחות / ריק) | מודל הבא (מפתח אחר לא יעזור) |
| 429 (מכסה) | התקררות **לזוג (מפתח, מודל)** בלבד, דקה; מפתח הבא, אותו מודל |
| 403 / 402 | מפתח פגום או חסום: התקררות לכל המודלים, 10 דקות; מפתח הבא |
| 400 עם `API key not valid` | מפתח לא תקין: התקררות לכל המודלים, שעה; מפתח הבא |
| 503 (עומס על המודל) | מפתח אחר לא יעזור; אחרי **שני** 503 עוברים למודל הבא |
| 400 אחר / 404 / 500 / timeout / שגיאת רשת | מודל הבא מיד |

למה ההבחנות: 429 הוא מכסה של מפתח **במודל מסוים**, ולכן מפתח שנחסם ב-flash עדיין תקין ב-flash-lite. 403 ו"מפתח לא תקין" נכונים לכל המודלים. 503 הוא על המודל, לא על המפתח.

## 3. סדר המודלים

ברירת המחדל בקוד: `gemini-3-flash-preview › 2.5-flash › 3.5-flash-lite › 2.5-flash-lite › 3.1-flash-lite-preview › 3.5-flash › 3.6-flash`. נמדד ב-2026-11-02 בשאלה קצרה: lite כ-1.3 שנ', 3-flash-preview כ-3.5, 2.5-flash כ-2.6, 3.5-flash כ-11.5, 3.6-flash כ-14. לכן המודלים האיטיים (והחדשים) נשארו כגיבוי אחרון. לשיחה חיה רצוי סדר של מהירות, ולעבודת עריכה או כתיבה ארוכה אפשר להעביר `models` משלכם (למשל החדש ביותר ראשון, כמו ב-print-center).

כל מודל שגוגל קבעה לו תאריך כיבוי מופיע ב-`MODEL_EXPIRATION`, ואחרי התאריך מדלגים עליו. **שמות מודלים משתנים:** לאמת ברשימת המודלים של גוגל לפני הסתמכות, ולעדכן את הרשימה והתאריכים.

## 4. מפתחות

- מקורות, לפי סדר: משתני סביבה `GEMINI_API_KEYS` (כמה מפתחות מופרדים בפסיק, רווח, נקודה-פסיק או שורה), `GEMINI_API_KEY`, `GOOGLE_API_KEY`. אם אין, מקור חלופי (באתר הבגרות: שורה מוצפנת `gemini_keys` בטבלת `app_secrets`; באתר האימון: טבלת `settings` עם המפתח `geminiKeys`). משתני הסביבה דורסים את ה-DB.
- הרשימה נקראת מחדש כל דקה (`force` מדלג על המטמון).
- **המפתח נשלח בכותרת `x-goog-api-key`, לא ב-URL.** (בגרסה הישנה היה `?key=` ב-URL, שמסתכן בדליפה ללוגים.)
- בלוגים, בתצוגות ובשגיאות מופיעה רק **סיומת של 4 תווים**. אין להחזיר מפתח מלא ללקוח או להדפיס אותו.
- שמירה ב-DB: הצפנה AES-256-GCM, מפתח הצפנה נגזר מסוד ראשי בשרת. בדף הניהול שדה כתיבה בלבד (הערך לא חוזר).
- **המכסה משותפת:** אם אותם מפתחות משמשים כמה אתרים, כולם נוגסים באותה מכסה. 429 חוזר = לשקול מפתחות נוספים או מודל אחר.

## 5. ממשק ה-API של המנוע

```js
const gemini = createGeminiPool({ env, models, loadKeysFallback, fetchImpl, now });

await gemini.generate({
  system,            // הנחיית מערכת (system_instruction)
  prompt,            // קיצור להודעת משתמש אחת
  contents,          // או רשימת הודעות [{role:'user'|'model', parts:[{text}]}]
  temperature,       // ברירת מחדל 0.4
  maxOutputTokens,   // ברירת מחדל 2048 (במודלי חשיבה חלק מהמכסה הולך למחשבות)
  json,              // true = responseMimeType application/json
  noThinking,        // true = thinkingBudget 0: מהיר בהרבה בעריכה קצרה (נמדד: 7.7 שנ' → 0.7-1.1 שנ' ב-2.5-flash)
  models,            // סדר מודלים מותאם לקריאה
  timeoutMs,         // דדליין כולל (ברירת מחדל 40000)
  accept,            // (text) => boolean: בדיקת תקינות התשובה
});
// → { text, model, key /* 4 תווים */, attempts: [{model, key, status}] }

await gemini.testKeys();   // [{key, status, ms}] לכל מפתח
await gemini.status();     // {source, models, keys:[{key, ok, fail, last, lastAt, coolingSec}]}
gemini.reset();            // מנקה מטמון מפתחות (אחרי שינוי מאגר)
```

שגיאה: `e.code === 'NO_KEYS'` כשאין מפתחות; אחרת `e.attempts` (לאבחון) ו-`e.rejectedText` (התשובה האחרונה ש-`accept` דחה).

## 6. `accept`: בדיקת תקינות התשובה (חשוב בעברית)

מודלים לפעמים מחזירים אותיות ערביות, קיריליות או סיניות באמצע עברית. המנוע מקבל `accept(text)` וממשיך לנסות כשהוא נדחה. בשימוש באתר:

```js
const FOREIGN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0400-\u04FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
accept: (t) => !FOREIGN.test(t)
```

ואם כל המודלים נדחו, אפשר להשתמש ב-`e.rejectedText` אחרי ניקוי (`text.replace(new RegExp(FOREIGN.source,'g'),'')`) כמוצא אחרון, אם נשאר מספיק טקסט.

## 7. דפוסי שימוש שנבדקו

1. **שיחה עם מדריכה (אתר האימון):** `system` + היסטוריית הודעות ב-`contents`, `accept` נגד כתב זר, רישום כל שאלה ביומן עם `model`, `key` ו-`attempts`.
2. **תיקון טקסט בקובץ Word (אתר הבגרות):** ג'מיני מקבל **רק** את הקטע שסומן, הפסקה שסביבו (ועוד פסקה לפניה ואחריה), מה שהמורה כתבה על הבעיה, והנחיות הכתיבה של המערכת (קובץ `fix-writing-guidelines.ts`). הוא מחזיר JSON `{"corrected": "..."}` בלבד. **ההכנסה לקובץ Word נעשית בסקריפט של האתר, לא על ידי ג'מיני**, כך שג'מיני לא נוגע במבנה הקובץ. הפרומפט מסמן את התוכן כנתונים ("לא הוראות") כהגנה מהזרקת הוראות.
3. **תקציר וניקוד (print-center):** `json: true` + `parseJsonLoose` לחילוץ JSON גם כשהמודל עוטף בגדר קוד.

כללים לכל שימוש חדש: להעביר ל-AI רק את מה שהוא צריך; לסמן תוכן שהגיע ממשתמשים כנתונים; לדרוש פלט במבנה קבוע; לוודא את הפלט (`accept`) לפני שמשתמשים בו; להגביל קצב למשתמש (באתר הבגרות: 20 בקשות לשעה למשתמשת).

## 8. תפעול ובדיקה

- **להריץ רק מהשרת.** סינון תוכן (כמו נטפרי) חוסם גישה ישירה מהדפדפן, וגם המפתח לא צריך להגיע לדפדפן.
- בדיקות עברית מול ה-API: מתוך `node` עם `fetch`, **לא** `curl` ב-Git Bash (קידוד).
- אחרי שינוי קוד בשרת מקומי שמחזיק קוד בזיכרון, להפעיל אותו מחדש.
- הסטטיסטיקה וההתקררות נשמרות **בזיכרון המופע** (ב-serverless כל מופע קר מתחיל מאפס). זו אינדיקציה, לא מקור אמת. אם צריך היסטוריה, לרשום `attempts` בכל קריאה לטבלת יומן.
- דף ניהול מומלץ: מצב המאגר (`status`), כפתור "בדיקת כל המפתחות" (`testKeys`), החלפת מאגר בלי פריסה. כל זה קיים באתר הבגרות ב-`/admin/fixes`.

## 9. מלכודות ידועות

- 400 על מפתח פגום אינו זהה ל-400 על בקשה פגומה: ההבחנה נעשית לפי הטקסט `API key not valid`.
- מודלי חשיבה מחזירים `parts` עם `thought: true`. מסננים אותם, אחרת מחזירים מחשבות כתשובה.
- **מהירות:** מודלים עם "חשיבה" לוקחים 8-17 שנ' גם לעריכה של משפט. לבקשה אינטראקטיבית קצרה להעביר `noThinking: true` ולהעדיף `gemini-2.5-flash` ראשון. מודל שלא תומך בכך מחזיר 400 והמנוע עובר הלאה לבא.
- `maxOutputTokens` נמוך מדי במודלי חשיבה יכול להחזיר תשובה ריקה (המחשבות אכלו את המכסה). להעלות.
- חסימת בטיחות מחזירה 200 בלי טקסט, עם `promptFeedback.blockReason`. מפתח אחר לא יעזור, ולכן עוברים מודל.
- במודל שעבר את תאריך הכיבוי שלו הקריאות נכשלות ב-404: לעדכן את הרשימה.
- ב-Vercel, אחרי שינוי משתני סביבה נדרשת פריסה מחדש; שמירה ב-DB (דף הניהול) לא דורשת.

## 10. רשימת בדיקה לבניית חיבור חדש ממסמך זה

1. להעתיק את `gemini-pool-portable.mjs` (בסעיף 12) כמו שהוא, או לתרגם לשפת היעד תוך שמירה על הטבלה בסעיף 2.
2. להגדיר `GEMINI_API_KEYS` (ולא להכניס מפתחות לקוד או ל-git).
3. להחליט על מקור חלופי למפתחות (DB מוצפן) אם רוצים החלפה בלי פריסה.
4. לכתוב `system`/פרומפט ולדרוש פלט במבנה קבוע; להוסיף `accept`.
5. להריץ את הבדיקות בסעיף 13 (`node --test`). כולן אמורות לעבור לפני שמחברים למערכת האמיתית.
6. לחבר דף ניהול עם `status`, `testKeys`.
7. לבדוק קריאה אמיתית אחת מהשרת (לא מהדפדפן) ולוודא ב-`attempts` שהמפתח והמודל צפויים.

## 11. איפה זה נמצא במחשב של הבעלים

- המקור: `G:\מחשבים אחרים\מחשב משה חדש\Music\מדפיס בוט\print-center\lib\ai.js` (ותיעוד בסעיף ב-`CLAUDE.md` שלו)
- הגרסה המשופרת: `Desktop\אימון פונקציונאלי\api\_gemini.js`
- אתר הבגרות: `src/lib/gemini-pool.ts`, `src/lib/gemini-fix.ts`, `src/lib/actions/gemini.ts`, `src/components/admin/gemini-pool-card.tsx`, והגרסה הניידת `docs/gemini-pool-portable.mjs`

## 12. הקוד המלא: `gemini-pool-portable.mjs`

```js
// מנוע חיבור לג'מיני עם מאגר מפתחות – גרסה ניידת (ESM, בלי תלויות; דורשת Node 18+ / סביבה עם fetch ו-AbortController).
// זו אותה לוגיקה בדיוק כמו src/lib/gemini-pool.ts באתר חומרי הבגרות, api/_gemini.js באתר האימון ו-lib/ai.js ב-print-center.
// תיעוד מלא: docs/gemini-connection-system.md
//
// שימוש מינימלי:
//   import { createGeminiPool } from './gemini-pool-portable.mjs';
//   const gemini = createGeminiPool();                       // מפתחות מ-GEMINI_API_KEYS
//   const r = await gemini.generate({ prompt: 'שלום' });      // → { text, model, key, attempts }
//
// הרחבות: loadKeysFallback (למשל קריאה מבסיס נתונים), models, now/fetch (להזרקה בבדיקות), isExpired.

export const DEFAULT_MODELS = [
  'models/gemini-3-flash-preview',
  'models/gemini-2.5-flash',
  'models/gemini-3.5-flash-lite',
  'models/gemini-2.5-flash-lite',
  'models/gemini-3.1-flash-lite-preview',
  'models/gemini-3.5-flash',
  'models/gemini-3.6-flash',
];

// מודלים שגוגל מכבה בתאריך מסוים (מדלגים עליהם אחריו)
export const MODEL_EXPIRATION = {
  'models/gemini-2.5-flash': '2027-06-17',
  'models/gemini-3-flash-preview': '2027-06-17',
  'models/gemini-2.5-flash-lite': '2027-07-22',
  'models/gemini-3.1-flash-lite-preview': '2027-07-22',
};

export const COOL_MS = { quota: 60_000, key: 10 * 60_000, badKey: 60 * 60_000 };
const ENV_NAMES = ['GEMINI_API_KEYS', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];
const API = 'https://generativelanguage.googleapis.com/v1beta/';

/** פירוק מחרוזת מפתחות (פסיק / נקודה-פסיק / רווח / שורה) לרשימה בלי כפילויות */
export const parseKeys = (raw) => [...new Set(String(raw || '').split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean))];

export function createGeminiPool({
  env = (typeof process !== 'undefined' ? process.env : {}),
  models = DEFAULT_MODELS,
  loadKeysFallback = null, // async () => string | string[] | null — מקור מפתחות חלופי כש-env ריק (למשל DB)
  fetchImpl = (...a) => fetch(...a),
  now = () => Date.now(),
  keysCacheMs = 60_000,
} = {}) {
  const stats = new Map(); // סיומת מפתח (4 תווים) → { ok, fail, last, lastAt, coolUntil, coolModel }
  let cache = { at: 0, keys: [], source: 'none' };
  let keyIndex = 0;

  const suffix = (k) => k.slice(-4);
  const statOf = (k) => {
    const s = suffix(k);
    if (!stats.has(s)) stats.set(s, { ok: 0, fail: 0, last: null, lastAt: null, coolUntil: 0, coolModel: {} });
    return stats.get(s);
  };
  const isExpired = (m) => (MODEL_EXPIRATION[m] ? now() > new Date(MODEL_EXPIRATION[m]).getTime() : false);

  async function getKeys(force = false) {
    if (!force && now() - cache.at < keysCacheMs && cache.keys.length) return cache.keys;
    let keys = [...new Set(ENV_NAMES.flatMap((n) => parseKeys(env[n])))];
    let source = keys.length ? 'env' : 'none';
    if (!keys.length && loadKeysFallback) {
      try {
        const v = await loadKeysFallback();
        keys = Array.isArray(v) ? parseKeys(v.join(',')) : parseKeys(v);
        if (keys.length) source = 'fallback';
      } catch { /* אין מקור חלופי – ממשיכים בלי */ }
    }
    cache = { at: now(), keys, source };
    return keys;
  }

  const extractText = (data) => {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const t = parts.filter((p) => !p.thought).map((p) => p.text || '').join(''); // מדלגים על "מחשבות" של מודלי חשיבה
    return t.trim() ? t : null;
  };

  /**
   * generate({ system, prompt | contents, temperature, maxOutputTokens, json, noThinking, models, timeoutMs, accept })
   *   → { text, model, key, attempts }
   * נזרקת שגיאה (עם .attempts, .rejectedText, ו-.code === 'NO_KEYS' כשאין מפתחות) רק אם כל המודלים × כל המפתחות נכשלו.
   *   contents: [{ role: 'user'|'model', parts: [{ text }] }]   (prompt = קיצור להודעת משתמש אחת)
   *   accept(text) → boolean: בדיקת תקינות; נדחה פעמיים באותו מודל → מודל הבא; בסוף rejectedText נשאר על השגיאה
   */
  async function generate(opts = {}) {
    const keys = await getKeys();
    if (!keys.length) {
      const e = new Error('no gemini keys');
      e.code = 'NO_KEYS';
      e.attempts = [];
      throw e;
    }
    const contents = opts.contents || [{ role: 'user', parts: [{ text: String(opts.prompt || '') }] }];
    const body = {
      contents,
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        ...(opts.noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}), // בלי "חשיבה": מהיר בהרבה בעריכה קצרה; מודל שלא תומך מחזיר 400 והמנוע עובר הלאה
      },
    };
    if (opts.system) body.system_instruction = { parts: [{ text: opts.system }] };
    const payload = JSON.stringify(body);

    const attempts = [];
    let lastError = null;
    let rejectedText = null;
    let totalRej = 0;
    const deadline = now() + (opts.timeoutMs ?? 40_000);

    for (const model of (opts.models || models).filter((m) => !isExpired(m))) {
      let skipModel = false;
      let overloaded = 0;
      let rejected = 0;
      for (let i = 0; i < keys.length && !skipModel; i++) {
        const idx = (keyIndex + i) % keys.length;
        const key = keys[idx];
        const st = statOf(key);
        if (st.coolUntil > now() || (st.coolModel[model] || 0) > now()) continue; // מפתח בהתקררות
        const left = deadline - now();
        if (left < 2000 || totalRej >= 4) {
          lastError = lastError || new Error('timeout');
          break;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.min(left, 25_000));
        const shortModel = model.replace('models/', '');
        try {
          // המפתח נשלח בכותרת (לא ב-URL), כדי שלא יידלף ללוגים של פרוקסי/שרת
          const res = await fetchImpl(`${API}${model}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: payload,
            signal: ctrl.signal,
          });
          const raw = await res.text();
          let data = null;
          try { data = JSON.parse(raw); } catch { /* לא JSON */ }
          attempts.push({ model: shortModel, key: suffix(key), status: res.status });
          st.last = res.status;
          st.lastAt = new Date(now()).toISOString();

          if (res.status === 200) {
            const text = extractText(data);
            if (text && opts.accept && !opts.accept(text)) {
              attempts[attempts.length - 1].status = 'rejected';
              rejectedText = text;
              lastError = new Error('rejected by validator');
              totalRej++;
              if (++rejected >= 2) skipModel = true;
              continue;
            }
            if (text) {
              st.ok++;
              keyIndex = (idx + 1) % keys.length; // הקריאה הבאה מתחילה מהמפתח הבא – פיזור עומס
              return { text: text.trim(), model: shortModel, key: suffix(key), attempts };
            }
            lastError = new Error('empty: ' + (data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '?'));
            skipModel = true; // חסימת בטיחות / תשובה ריקה – מפתח אחר לא יעזור
            continue;
          }
          const msg = String(data?.error?.message || '');
          if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(raw)) {
            st.fail++; st.coolUntil = now() + COOL_MS.badKey; lastError = new Error('invalid key …' + suffix(key)); continue;
          }
          if (res.status === 429) { st.fail++; st.coolModel[model] = now() + COOL_MS.quota; lastError = new Error('quota 429'); continue; }
          if (res.status === 402 || res.status === 403) { st.fail++; st.coolUntil = now() + COOL_MS.key; lastError = new Error('key ' + res.status); continue; }
          if (res.status === 503) { lastError = new Error('overloaded 503'); if (++overloaded >= 2) skipModel = true; continue; }
          lastError = new Error(`API ${res.status}: ${msg.slice(0, 160)}`);
          skipModel = true; // 400/404/500 – החלפת מפתח לא תעזור
        } catch (e) {
          const aborted = e && e.name === 'AbortError';
          attempts.push({ model: shortModel, key: suffix(key), status: aborted ? 'timeout' : 'error' });
          lastError = aborted ? new Error('timeout') : e;
          skipModel = true;
        } finally {
          clearTimeout(timer);
        }
      }
    }
    const err = new Error('all models/keys failed: ' + ((lastError && lastError.message) || '?'));
    err.attempts = attempts;
    err.rejectedText = rejectedText;
    throw err;
  }

  /** בדיקת כל מפתח בקריאה קטנה אחת (לדף ניהול) */
  async function testKeys() {
    const keys = await getKeys(true);
    const out = [];
    for (const key of keys) {
      const t0 = now();
      try {
        const r = await fetchImpl(`${API}models/gemini-2.5-flash:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }], generationConfig: { maxOutputTokens: 8 } }),
          signal: AbortSignal.timeout(15_000),
        });
        out.push({ key: '…' + suffix(key), status: r.status, ms: now() - t0 });
      } catch {
        out.push({ key: '…' + suffix(key), status: 'error', ms: now() - t0 });
      }
    }
    return out;
  }

  /** מצב המאגר – רק סיומות של 4 תווים, לעולם לא המפתח המלא */
  async function status() {
    const keys = await getKeys();
    return {
      source: cache.source,
      models: models.filter((m) => !isExpired(m)).map((m) => m.replace('models/', '')),
      keys: keys.map((k) => {
        const s = statOf(k);
        return { key: '…' + suffix(k), ok: s.ok, fail: s.fail, last: s.last, lastAt: s.lastAt, coolingSec: Math.max(0, Math.round((s.coolUntil - now()) / 1000)) };
      }),
    };
  }

  const reset = () => { cache = { at: 0, keys: [], source: 'none' }; };
  return { generate, getKeys, testKeys, status, reset };
}

/** חילוץ JSON מתשובה גם אם עטופה ב-```json או עם טקסט מסביב */
export function parseJsonLoose(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* ממשיכים */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* ממשיכים */ } }
  return null;
}
```

## 13. הבדיקות המלאות: `gemini-pool-portable.test.mjs`

הרצה: `node --test gemini-pool-portable.test.mjs` (לשנות את נתיב ה-import בראש הקובץ לפי מיקום הקובץ).

```js
/**
 * בדיקות למנוע הניד (docs/gemini-pool-portable.mjs) עם fetch מדומה – בלי רשת ובלי מפתחות אמיתיים. הרצה:
 *   node --test scripts/gemini-pool-portable.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiPool, parseJsonLoose, parseKeys } from "../docs/gemini-pool-portable.mjs";

const ok = (text) => ({ status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) });
const fail = (status, error = "x") => ({ status, text: async () => JSON.stringify({ error: { message: error } }) });

/** fetch מדומה: script(model, key, n) → תשובה; רושם כל קריאה */
function mock(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const model = /models\/([^:]+):/.exec(url)[1];
    const key = init.headers["x-goog-api-key"];
    calls.push({ model, key, url });
    return script(model, key, calls.length);
  };
  return { fetchImpl, calls };
}
const pool = (script, keys = "AAAA1111,BBBB2222", extra = {}) => {
  const m = mock(script);
  const p = createGeminiPool({ env: { GEMINI_API_KEYS: keys }, fetchImpl: m.fetchImpl, ...extra });
  return { p, calls: m.calls };
};

test("parseKeys: splits on comma/space/newline, de-duplicates", () => {
  assert.deepEqual(parseKeys("a, b;c\nd a"), ["a", "b", "c", "d"]);
});

test("key travels in a header, never in the URL", async () => {
  const { p, calls } = pool(() => ok("שלום"));
  const r = await p.generate({ prompt: "hi" });
  assert.equal(r.text, "שלום");
  assert.ok(!calls[0].url.includes("AAAA1111") && !calls[0].url.includes("key="));
});

test("429 on one key rotates to the next key, same model", async () => {
  const { p, calls } = pool((model, key) => (key === "AAAA1111" ? fail(429) : ok("תשובה")));
  const r = await p.generate({ prompt: "hi" });
  assert.equal(r.key, "2222");
  assert.equal(calls[0].model, calls[1].model);
  const st = await p.status();
  assert.equal(st.keys.find((k) => k.key === "…1111").fail, 1);
});

test("a cooled-down key is skipped on the next call", async () => {
  const { p, calls } = pool((model, key) => (key === "AAAA1111" ? fail(403) : ok("x")));
  await p.generate({ prompt: "1" });
  const before = calls.length;
  await p.generate({ prompt: "2" });
  assert.ok(calls.slice(before).every((c) => c.key === "BBBB2222"));
});

test("invalid key (400 API key not valid) cools the key for all models", async () => {
  const { p } = pool((model, key) => (key === "AAAA1111" ? fail(400, "API key not valid") : ok("x")));
  await p.generate({ prompt: "1" });
  assert.ok((await p.status()).keys.find((k) => k.key === "…1111").coolingSec > 3000);
});

test("500 moves to the next model without trying other keys", async () => {
  const { p, calls } = pool((model) => (calls0(model) ? fail(500) : ok("מודל שני")));
  function calls0(model) { return model === "gemini-3-flash-preview"; }
  const r = await p.generate({ prompt: "hi" });
  assert.equal(r.text, "מודל שני");
  assert.equal(calls.filter((c) => c.model === "gemini-3-flash-preview").length, 1);
});

test("two 503s on a model move to the next model", async () => {
  const { p, calls } = pool((model) => (model === "gemini-3-flash-preview" ? fail(503) : ok("x")));
  await p.generate({ prompt: "hi" });
  assert.equal(calls.filter((c) => c.model === "gemini-3-flash-preview").length, 2);
});

test("accept() rejects bad answers; rejectedText survives when all fail", async () => {
  const { p } = pool(() => ok("مرحبا שלום"), "AAAA1111,BBBB2222");
  await assert.rejects(
    p.generate({ prompt: "hi", accept: (t) => !/[؀-ۿ]/.test(t) }),
    (e) => e.rejectedText === "مرحبا שלום" && e.attempts.some((a) => a.status === "rejected"),
  );
});

test("no keys → NO_KEYS error", async () => {
  const p = createGeminiPool({ env: {}, fetchImpl: async () => ok("x") });
  await assert.rejects(p.generate({ prompt: "hi" }), (e) => e.code === "NO_KEYS");
});

test("fallback key source is used only when env is empty", async () => {
  const m = mock(() => ok("x"));
  const p = createGeminiPool({ env: {}, fetchImpl: m.fetchImpl, loadKeysFallback: async () => "CCCC3333" });
  await p.generate({ prompt: "hi" });
  assert.equal(m.calls[0].key, "CCCC3333");
  assert.equal((await p.status()).source, "fallback");
});

test("successive calls start from the next key (load spreading)", async () => {
  const { p, calls } = pool(() => ok("x"));
  await p.generate({ prompt: "1" });
  await p.generate({ prompt: "2" });
  assert.deepEqual(calls.map((c) => c.key), ["AAAA1111", "BBBB2222"]);
});

test("thought parts are ignored; empty answer (safety block) moves on", async () => {
  const mixed = { status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "חשיבה", thought: true }, { text: "תשובה" }] } }] }) };
  const { p } = pool(() => mixed);
  assert.equal((await p.generate({ prompt: "hi" })).text, "תשובה");
  const blocked = { status: 200, text: async () => JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }) };
  const q = pool(() => blocked).p;
  await assert.rejects(q.generate({ prompt: "hi" }), /empty: SAFETY/);
});

test("parseJsonLoose handles fences and surrounding text", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('הנה: {"a":2} תודה'), { a: 2 });
  assert.equal(parseJsonLoose("אין"), null);
});
```
