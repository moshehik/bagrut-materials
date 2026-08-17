# חומרים לבגרות

מאגר שיעורים מוכנים למורות במחוז החרדי – Next.js 16 + Neon Postgres (Drizzle) + Vercel Blob.

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
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (אחסון קבצים פרטי) |

## מבנה

- `src/db/schema.ts` – טבלאות: users, categories (עץ), materials, purchases, downloads, forum, sell_offers
- `src/lib/data.ts` – שאילתות + `checkEntitlement` (בדיקת זכאות להורדה)
- `src/lib/watermark.ts` – הטבעת מספר אישי + זכויות יוצרים על כל עמוד PDF
- `src/app/api/download/[id]` – הורדה מאובטחת (הטבעה + רישום)
- `src/app/admin` – ניהול עץ הקטגוריות, העלאת קבצים, משתמשות, הצעות מכירה
- `scripts/seed.ts` – זריעת עץ המקצועות

## פריסה

הפרויקט מקושר ל-Vercel (`bagrut-materials`) ול-GitHub (`moshehik/bagrut-materials`).
