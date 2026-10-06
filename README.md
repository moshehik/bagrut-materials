# חומרים לבגרות

מאגר שיעורים מוכנים למורות במחוז החרדי – Next.js 16 + Neon Postgres (Drizzle) + אחסון קבצים ב-Google Drive (ר' `docs/drive-storage.md`; Vercel Blob בוטל לחלוטין — אין בו שימוש).

## הרצה מקומית

```bash
npm install
# יצירת הטבלאות ב-Neon: `db:push` (drizzle-kit push) שבור בסביבה הזו — יוצרים טבלאות/עמודות חדשות
# בסקריפט SQL גולמי, לדוגמה `npx tsx scripts/create-fix-tables.ts` (ר' גם docs/drive-storage.md).
npm run db:seed      # עץ הקטגוריות + משתמש מנהל
npm run dev
```

משתני סביבה (`.env.local`; ב-Vercel צריך Redeploy אחרי שינוי):

| משתנה | חובה? | תיאור |
| --- | --- | --- |
| `DATABASE_URL` | חובה | חיבור ל-Neon |
| `SESSION_SECRET` | חובה | סוד לחתימת עוגיית ההתחברות — 32 תווים לפחות; בפרודקשן השרת זורק שגיאה בלעדיו (מקומית יש ברירת מחדל לפיתוח) |
| `ADMIN_EMAILS` | חובה | מיילים (מופרדים בפסיק) שמקבלים הרשאת מנהל; הראשון הוא גם נמען מיילי המערכת |
| `DRIVE_BRIDGE_URL` / `DRIVE_BRIDGE_SECRET` | חובה | גשר Google Drive (Apps Script) לאחסון הקבצים — בלעדיו אין הורדות/העלאות (ר' `docs/drive-storage.md`) |
| `DRIVE_ROOT_FOLDER` | רשות | שם תיקיית הארכיון בדרייב (ברירת מחדל `bagrut-materials-archive`) |
| `ORACLE_CONVERT_URL` / `ORACLE_CONVERT_API_KEY` | חובה לתצוגה מקדימה | שירות ההמרה docx→PDF לתצוגה באתר; בלעדיו התצוגה המקדימה נכשלת (ההורדה עצמה עובדת) |
| `MAIL_SCRIPT_URL` | חובה למיילים | כתובת `/exec` של Apps Script המייל (ר' `docs/mail-script.md`); בלעדיו לא נשלח שום מייל (איפוס סיסמה, אימות, התראות). **לא לשים בקוד — ה-repo ציבורי** |
| `MAIL_FROM_NAME` | רשות | שם השולח במיילים (ברירת מחדל: שם האתר) |
| `NEXT_PUBLIC_SITE_URL` | רשות (מומלץ) | כתובת האתר המלאה לקישורים במיילים ול-OAuth; ב-Vercel נופל ל-`VERCEL_PROJECT_PRODUCTION_URL`, מקומית ל-localhost |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | רשות | כניסה עם Google (OAuth); בלעדיהם לחצן "כניסה עם Google" מוסתר |
| `GH_DISPATCH_TOKEN` | רשות | GitHub PAT לשליחת `repository_dispatch` שמריץ את סוכן התיקונים מיד כשנוצר דיווח חדש (ר' `src/lib/agentDispatch.ts`); בלעדיו ה-cron כל 5 דק' עדיין מכסה הכל |
| `GH_DISPATCH_REPO` | רשות | ה-repo להפעלה (ברירת מחדל `moshehik/bagrut-materials`) |
| `SEED_ADMIN_PASSWORD` | רשות (סקריפט) | סיסמת המנהל ב-`db:seed`; בלעדיה נוצרת סיסמה אקראית (כניסה עם Google / "שכחתי סיסמה") |
| `SEED_PRUNE=1` / `SEED_DEMO=1` | רשות (סקריפט) | ב-`db:seed`: מחיקת קטגוריות שאינן בעץ / זריעת נתוני דוגמה |

(`GITHUB_TOKEN`, `GITHUB_RUN_ID`, `GITHUB_REPOSITORY`, `AGENT_RUN_ID`, `VERCEL_PROJECT_PRODUCTION_URL` מגיעים אוטומטית מ-GitHub Actions / Vercel — לא מגדירים ידנית.)

## מבנה

- `src/db/schema.ts` – טבלאות: users, categories (עץ), materials, purchases, downloads, forum, sell_offers
- `src/lib/data.ts` – שאילתות + `checkEntitlement` (בדיקת זכאות להורדה)

### מסלולים ומחירים (עדכון 2026-10-06)

- **אין "תוספת פרימיום"**: הרעיון בוטל לגמרי. מנוי פעיל שמכסה את המקצוע פותח את **כל** סוגי החומרים (גם שאלות מבגרויות,
  מצגות, טיפים ורעיונות). העמודות `purchases.premium`, `cart_items.premium` ו-`materials.premium_only` עדיין קיימות ב-Neon
  (לא הורצה DDL) אבל הוסרו מ-`src/db/schema.ts` – שום קוד לא קורא ולא כותב אותן. ערך ה-enum `access = 'premium'` נשאר
  (אי אפשר למחוק ערך enum בלי DDL) ומתנהג כמו `paid`.
- **המסלולים החודשיים הישנים** `subject_monthly` / `custom_monthly` הוסרו מהמכירה (`RETIRED_PLANS` ב-`src/lib/constants.ts`):
  `/checkout?plan=...` מציג "המסלול הזה כבר לא קיים", `purchaseAction` / `checkoutCart` / מנוי ידני מסרבים להם. ערכי ה-enum
  נשארים בשביל שורות היסטוריות (תוויות "(מסלול ישן)" בניהול), ושורות פעילות ישנות עדיין מקנות גישה. `custom_monthly`
  עדיין נוצר פנימית במימוש קופון פרטי (`private-coupons.ts`) – זה מענק, לא רכישה.
- המסלולים שנמכרים: הורדה בודדת, קובץ מורחב (תיקייה), מנוי שנתי (עד 3 מקצועות), ממלאת מקום 3 חודשים, ממלאת מקום יומית.
- `src/lib/watermark.ts` – הטבעת מספר אישי + זכויות יוצרים על כל עמוד PDF
- `src/app/api/download/[id]` – הורדה מאובטחת (הטבעה + רישום)
- `src/app/admin` – ניהול עץ הקטגוריות, העלאת קבצים, משתמשות, הצעות מכירה
- `scripts/seed.ts` – זריעת עץ המקצועות

## פריסה (העלאה לאתר החי)

הפרויקט: Vercel `bagrut-materials` (כתובת: https://bagrut-materials.vercel.app), קוד ב-GitHub `moshehik/bagrut-materials`.

**מ-2026-10-04 ה-repo ציבורי (כמו `gemach-app`), ולכן `git push origin main` מעלה את האתר אוטומטית.** (עד אז ה-repo היה פרטי, וב-Vercel Hobby repo פרטי מפרס רק commit של בעל הצוות, אז כל push נחסם.) כי ה-repo ציבורי: **לעולם לא לשים סודות בקוד** (`.env*` מוחרגים).

אימות אחרי push: `npx vercel ls bagrut-materials --scope team_ktg14QXUIxVh6dPLI5awK0Vw` — השורה העליונה צריכה להיות Ready, לא Blocked.

אם פעם push שוב נחסם, או כשרוצים להעלות מיד מהמחשב — הפקודה המהירה (או `/deploy` ב-Claude Code):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-site.ps1 -Message "מה השתנה"
```

טבלאות/עמודות חדשות ב-`schema.ts` צריך ליצור ב-DB **לפני** ה-push (`db:push` שבור במחשב הזה — ר' `scripts/create-fix-tables.ts`), כי push מעלה מיד.
