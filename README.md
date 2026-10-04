# חומרים לבגרות

מאגר שיעורים מוכנים למורות במחוז החרדי – Next.js 16 + Neon Postgres (Drizzle) + אחסון קבצים ב-Google Drive (ר' `docs/drive-storage.md`; Vercel Blob הושעה ואינו בשימוש).

## הרצה מקומית

```bash
npm install
npm run db:push      # יצירת הטבלאות ב-Neon
npm run db:seed      # עץ הקטגוריות + משתמש מנהל
npm run dev
```

משתני סביבה (`.env.local`):

| משתנה | תיאור |
| --- | --- |
| `DATABASE_URL` | חיבור ל-Neon |
| `SESSION_SECRET` | סוד לחתימת עוגיית ההתחברות |
| `ADMIN_EMAILS` | מיילים (מופרדים בפסיק) שיקבלו הרשאת מנהל בהרשמה |
| `DRIVE_BRIDGE_URL` / `DRIVE_BRIDGE_SECRET` / `DRIVE_ROOT_FOLDER` | גשר Google Drive לאחסון הקבצים (ר' `docs/drive-storage.md`) |

## מבנה

- `src/db/schema.ts` – טבלאות: users, categories (עץ), materials, purchases, downloads, forum, sell_offers
- `src/lib/data.ts` – שאילתות + `checkEntitlement` (בדיקת זכאות להורדה)
- `src/lib/watermark.ts` – הטבעת מספר אישי + זכויות יוצרים על כל עמוד PDF
- `src/app/api/download/[id]` – הורדה מאובטחת (הטבעה + רישום)
- `src/app/admin` – ניהול עץ הקטגוריות, העלאת קבצים, משתמשות, הצעות מכירה
- `scripts/seed.ts` – זריעת עץ המקצועות

## פריסה (העלאה לאתר החי)

הפרויקט: Vercel `bagrut-materials` (כתובת: https://bagrut-materials.vercel.app), קוד ב-GitHub `moshehik/bagrut-materials`.

> **⚠️ `git push` לא מעלה את האתר** (מ-2026-09-22). Vercel חוסם כל פריסה שמגיעה מ-GitHub ("Blocked") כי חשבון ה-GitHub מקושר למשתמש Vercel שני, ובתוכנית Hobby רק הבעלים רשאי לפרוס. האתר מתעדכן **רק** בפקודה הבאה, שמריצה את Vercel CLI בתור הבעלים.

הפקודה המהירה (מתיקיית הפרויקט, PowerShell) — או פשוט `/deploy` ב-Claude Code:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-site.ps1 -Message "מה השתנה"
```

היא בודקת טיפוסים, עושה commit+push לנתיבי הקוד בלבד, מייצאת עותק נקי של `HEAD`, מעלה אותו ל-Vercel (`--archive=tgz`) ומאמתת שהאתר ענה 200. פירוט והמלכודות: `.claude/commands/deploy.md` ו-`CLAUDE.md` (סעיף "Deploying the live site").

**התיקון הקבוע** (לא בקוד — בחשבונות): ב-vercel.com לנתק את GitHub ממשתמש `m0527682759-1046` ולחבר אותו לחשבון הבעלים `moshehik`. אחרי זה `git push` לבד יעלה אוטומטית.

טבלאות/עמודות חדשות ב-`schema.ts` צריך ליצור ב-DB **לפני** הפריסה (`db:push` שבור במחשב הזה — ר' `scripts/create-fix-tables.ts` כדוגמה).
