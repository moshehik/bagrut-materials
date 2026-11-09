# תור הפקת מצגות בנוטבוק — Vercel Cron (2026-11-09)

מחליף את Apps Script (`_tools/pres/gas/NotebookQueue.gs`, פרויקט `nblm-queue`), שהפסיק להפיק: ב-2026-11-08 21:59 הופקה המצגת האחרונה, ו-60 חלקים נשארו תקועים בתור שלו כ-16 שעות.

## איך זה עובד
- **מנוי Pro של Vercel**: כרון בתדירות של פעם בדקה (ב-Hobby רק פעם ביום), דיוק דקה, עד 100 כרונים לפרויקט, maxDuration עד 800 שניות. לוחות הזמנים ב-UTC. אין ניסיון חוזר אם ריצה נכשלת; ההפעלה "best effort" וייתכנו הפעלות כפולות/חופפות (ולכן יש נעילה).
- `vercel.json` ← `GET /api/cron/deck-queue` כל דקה, עם `Authorization: Bearer <CRON_SECRET>`.
- ה-tick ([tick.ts](../src/lib/deck-queue/tick.ts)) הוא פורט של `tickBody_`: בודק את ה-jobs הרצים בשרת הנוטבוק (Oracle), מקדם src → gen → dl, מוריד את `images.pdf` ושומר בדרייב (תיקייה "נוטבוק - תמונות גולמיות (תור הפקות)" בשורש ה-My Drive של חשבון הארכיון, **מחוץ** לארכיון האתר), ומתחיל jobs חדשים עד `max_concurrent` (ברירת מחדל 5) כל עוד לא `all_slides_exhausted`.
- המצב ב-Neon: `deck_jobs` (כולל טקסט המקור והפרומפט — לא בגיט הציבורי) ו-`deck_queue_state` (שורה אחת: מתג חירום, נעילה, סטטוס). הלוגיקה הטהורה ב-[logic.ts](../src/lib/deck-queue/logic.ts), נבדקת ב-`scripts/deck-queue-logic.test.ts`.
- כשל בהורדה/העלאה: ממשיכים מאותו שלב (עד 6 ניסיונות) בלי מחברת חדשה, כדי לא לבזבז מכסה. כשל ביצירה: ניסיון חוזר אחרי 5 דק' (עד 3), מכסה: המתנה 15 דק'.
- הרץ המקומי (`_tools/pres/queue-runner.cjs`) במצב `MODE=vercel` (או `DECK_MODE=vercel`): מכין פרומפטים, שולח ל-DB (`scripts/deck-queue.ts submit`), ממתין ומוריד את התמונות לפי fileId, ואז overlay/דרייב כמו קודם. jobs שנשלחו בעבר ל-GAS ולא קיימים ב-DB: נבדק קודם אם GAS סיים אותם, אחרת נשלחים מחדש.

## משתני סביבה (Vercel, production)
`CRON_SECRET` (≥32 תווים), `NBLM_SITE_PASSWORD`, `NBLM_BASE` (ברירת מחדל = הדומיין של Oracle). בלי `CRON_SECRET` ה-route מחזיר 503. הכרון נשלח רק מפריסת production, ו-CRON_SECRET נקלט בזמן build — אחרי שינוי צריך פריסה מחדש.

## טבלאות
`npx tsx scripts/create-deck-queue-tables.ts --apply` (בוצע 2026-11-09). מתג החירום נוצר **דלוק** — הכרון לא מתחיל כלום עד:

## ניהול (מהמחשב)
`NODE_OPTIONS=--use-system-ca npx tsx --conditions=react-server scripts/deck-queue.ts <status|resume|kill|set-max N|retry --id X|tick [--force]|submit --file F|get --id X --to pdf>`.
בדיקה מרחוק: `GET /api/cron/deck-queue/status` עם אותה כותרת Bearer.

## מעבר מ-GAS
GAS מת בפועל (ראה למעלה). כדי למנוע הפעלה כפולה אחרי המעבר: בעורך של פרויקט `nblm-queue` להריץ `removeTick` (או Script Property `KILL_SWITCH=1`). אין צורך לייבא את התור הישן: הרץ שולח מחדש את ה-60 החלקים התקועים לפי אותו id.

## שלב הבא (לא בוצע): כיתובים/overlay ב-Vercel
נבדק (סוכן, 2026-11-09): אפשרי. `overlay.cjs` תלוי רק ב-sharp/pdf-lib/fontkit (כבר באתר) + גופן Alef ושני לוגואים (~1.3MB). החלק הכבד, `pdf-to-img` (pdfjs+canvas), אפשר לעקוף בחילוץ התמונה המוטמעת מה-PDF (פי 6 מהר יותר). הערכה: 1-2 דקות לחלק, <400MB. נדרש ריפקטור ל-`buildDeckPdf` משותף + בדיקת golden מול הפלט הנוכחי (~יום-יומיים). שלבי בדיקת הכיתובים/RTL/עיניים נשארים ידניים בכל מקרה.
