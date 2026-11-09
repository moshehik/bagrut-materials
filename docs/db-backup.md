# גיבוי מסד הנתונים (Neon) לדרייב

נבנה 2026-11-09 (בהשראת מערכת הגיבוי של gemach-app, `BACKUPS.md` שם), **בלי** Apps Script שמעיר את ורסל: התזמון הוא Vercel Cron (חשבון Pro, בלי מגבלת מספר כרונים).

## מה מגובה
**כל** טבלאות סכמת `public` ב-Neon (48 טבלאות, ~47,500 שורות ב-2026-11-09): משתמשות, רכישות (`purchases`, `transactions`), תשלומי נדרים (`nedarim_*`), הגדרות, וכל הלוגים (`page_views`, `audit_logs`, `drive_events`, `agent_events`, `email_logs`, `downloads`…). גם `app_secrets` (הערכים מוצפנים AES-GCM, כמו במסד). הלוגים באתר נגזמים לפי `logs_retention_days` (365) — הגיבוי שומר אותם מעבר לכך.

## איך זה עובד
- `vercel.json`: כרון `/api/cron/db-backup` ב-01:00, 07:00, 13:00, 19:00 UTC. [src/app/api/cron/db-backup/route.ts](../src/app/api/cron/db-backup/route.ts) מאמת `Authorization: Bearer <CRON_SECRET>` (אותו סוד של כרון תור המצגות).
- [run.ts](../src/lib/db-backup/run.ts) מחליט אם צריך: **גיבוי אחד ביום** (מדלג אם יש גיבוי מוצלח מ-20 השעות האחרונות); אם הגיבוי של 01:00 נכשל — הכרון של 07:00 מנסה שוב, וכן הלאה. נעילה ב-`settings.db_backup_state` (updated_at) מונעת ריצה כפולה (best-effort delivery של כרון).
- [dump.ts](../src/lib/db-backup/dump.ts): כל טבלה נקראת כ-`to_jsonb` בדפים של 10,000 שורות ממוינים לפי ה-PK (4 טבלאות במקביל), לקובץ אחד `bagrut-db-YYYY-MM-DD-HHMM.json.gz` (UTC). אין `pg_dump` בסביבת ורסל. **לא אטומי בין טבלאות** (לוגים רק גדלים; הטבלאות הקטנות נקראות בתוך שניות).
- העלאה resumable ישירה ל-Drive REST לתיקייה **"גיבוי מסד נתונים (Neon) — לא למחוק"** בשורש ה-My Drive, **מחוץ** לארכיון האתר (כדי ש-drive-sync לא יצרף את הקבצים כחומרים; אותו עיקרון כמו תמונות תור המצגות). פרטית — לא משותפת. אימות: גודל הקובץ בדרייב = גודל המקור.
- **שימור:** 14 הימים האחרונים (הגיבוי האחרון בכל יום) + גיבוי אחד לכל שבוע ISO ב-8 השבועות שלפניהם. מועבר לפח של דרייב (ניתן לשחזור 30 יום), לא נמחק סופית; לא רץ אם יש פחות מ-3 גיבויים; קבצים בתיקייה שאינם בשם גיבוי לא נוגעים.
- **רישום:** שורת `audit_logs` (`action=db_backup`) לכל ריצה; מצב אחרון ב-`settings.db_backup_state` (JSON: `lastOkAt`, `lastOkName`, `lastOkFileId`, `lastOkBytes`, `lastError`, `consecutiveFailures`).
- **התראה:** אחרי **שני כשלונות רצופים** נשלח מייל למנהלת (`ADMIN_EMAILS`, דרך `sendMail`, `kind=system`), לא יותר מפעם ב-12 שעות. אם ורסל בכלל לא מריץ את הכרון — אין מייל (כמו ב-gemach-app); זה נראה ב-status (ראו להלן).
- כיבוי: הגדרה `db_backup_enabled` ב-`/admin/settings` (קבוצה "דרייב"; ברירת מחדל דלוק).

## בדיקה ופעולות ידניות
```
npx tsx scripts/db-backup.ts --run [--force]      # גיבוי מלא לדרייב (אותו קוד של הכרון)
npx tsx scripts/db-backup.ts --local out.json.gz  # קובץ מקומי בלבד, בלי דרייב ובלי כתיבה ל-DB
npx tsx scripts/db-backup.ts --status             # מצב + רשימת הקבצים בדרייב
npx tsx scripts/verify-db-backup.ts               # מוריד את האחרון ומשווה ספירות לכל טבלה מול המסד החי
npx tsx --test scripts/db-backup-logic.test.ts    # בדיקות לוגיקה (שימור, שבוע ISO, התראות, מיון טבלאות)
```
מרחוק: `GET /api/cron/db-backup/status` עם `Authorization: Bearer <CRON_SECRET>` מחזיר מצב ורשימת קבצים; `GET /api/cron/db-backup?force=1` (אותו אימות) מפעיל גיבוי מיידי.

## שחזור
`scripts/restore-db-backup.ts` — ברירת מחדל dry-run. היעד חייב להיות מסד **עם הסכמה קיימת וריק** (ענף Neon חדש + סקריפטי `scripts/create-*.ts`; `db:push` שבור כאן):
```
npx tsx scripts/restore-db-backup.ts --drive latest --target "<connection-string>"            # dry-run
npx tsx scripts/restore-db-backup.ts --drive latest --target "<connection-string>" --apply
```
שורות נטענות ב-`json_populate_recordset` (שומר טיפוסי עמודות), לפי סדר מפתחות זרים (הורים לפני ילדים), בקטעים של 2,000, ובסוף סדרות (serial) מסונכרנות. טבלה שיש בה כבר שורות — מדלג (דורסים רק עם `--allow-nonempty`); יעד = `DATABASE_URL` של הייצור נחסם בלי הדגל. מומלץ להשתמש ב-Neon PITR (שחזור לנקודת זמן) למקרי "מחקתי בטעות" ביממה-שבוע האחרונים, ובגיבוי הזה לאסון / מעבר מחוץ ל-Neon / לוגים ישנים.

## מה נבדק (2026-11-09)
- הפקה על המסד החי: 48 טבלאות, 47,510 שורות, 19.5MB JSON → 2.1MB gz, ~40 שניות.
- **בדיקת הלוך-חזור (קריאה בלבד):** כל שורה בגיבוי, אחרי `json_populate_recordset` לפי טיפוסי הטבלה, זהה ל-jsonb המקורי בכל 48 הטבלאות (כלומר טעינה מחדש לא משנה טיפוסים/תאריכים/JSON).
- ריצה אמיתית: הועלה `bagrut-db-2026-11-09-1402.json.gz` לדרייב; `verify-db-backup.ts` — קריא ושלם; ריצה שנייה דילגה ("יש גיבוי מהשעות האחרונות").
- **לא נבדק:** שחזור בפועל (`--apply`) למסד יעד חי (אין מסד יעד זמין); מייל ההתראה; הכרון עצמו בוורסל (דורש פריסה); שימור בפועל (אין עדיין 3 גיבויים).

## לפני/אחרי פריסה
- `CRON_SECRET` חייב להיות מוגדר ב-Vercel (אותו סוד של `deck-queue`; ר' `docs/deck-queue-vercel.md`). אין טבלאות/עמודות חדשות — לא צריך DDL ב-Neon.
- אחרי הפריסה: `GET /api/cron/db-backup/status` עם הסוד, ולוודא בדרייב שהקובץ הבא מופיע ב-01:00/07:00 UTC.
- הגיבוי מכיל נתוני משתמשות (מיילים, טלפונים, hash של סיסמאות): התיקייה פרטית בדרייב של חשבון הארכיון; לא לשתף.
