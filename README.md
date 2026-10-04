# חומרים לבגרות

מאגר שיעורים מוכנים למורות במחוז החרדי – Next.js 16 + Neon Postgres (Drizzle) + אחסון קבצים ב-Google Drive (ר' `docs/drive-storage.md`; Vercel Blob בוטל לחלוטין — אין בו שימוש).

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

**מ-2026-10-04 ה-repo ציבורי (כמו `gemach-app`), ולכן `git push origin main` מעלה את האתר אוטומטית.** (עד אז ה-repo היה פרטי, וב-Vercel Hobby repo פרטי מפרס רק commit של בעל הצוות, אז כל push נחסם.) כי ה-repo ציבורי: **לעולם לא לשים סודות בקוד** (`.env*` מוחרגים).

אימות אחרי push: `npx vercel ls bagrut-materials --scope team_ktg14QXUIxVh6dPLI5awK0Vw` — השורה העליונה צריכה להיות Ready, לא Blocked.

אם פעם push שוב נחסם, או כשרוצים להעלות מיד מהמחשב — הפקודה המהירה (או `/deploy` ב-Claude Code):

```powershell
powershell -ExecutionPolicy Bypass -File scriptsdeploy-site.ps1 -Message "מה השתנה"
```

טבלאות/עמודות חדשות ב-`schema.ts` צריך ליצור ב-DB **לפני** ה-push (`db:push` שבור במחשב הזה — ר' `scripts/create-fix-tables.ts`), כי push מעלה מיד.
