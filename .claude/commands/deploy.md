---
description: מעלה עדכון לאתר החי (bagrut-materials.vercel.app) בפקודה אחת — בדיקת טיפוסים, commit, push, פריסה ל-Vercel מעותק נקי, ואימות שהאתר עלה.
argument-hint: "[הודעת commit קצרה] — אפשר להשאיר ריק אם הכול כבר committed"
---

המשתמשת ביקשה להעלות את העדכונים לאתר. **ההרצה של `/deploy` עצמה היא האישור לפריסה לפרודקשן** — אין צורך לשאול שוב.

## הכלל החשוב (נכון מ-2026-09-22)
`git push` **לא** מעלה את האתר. Vercel חוסם כל פריסה שמגיעה מ-GitHub ("Blocked", חשבון GitHub מקושר למשתמש Vercel שני). האתר מתעדכן **רק** דרך הסקריפט למטה, שמריץ את Vercel CLI בתור הבעלים. אל תכתוב/תגיד "הועלה" אחרי push בלבד.

## מה לעשות
1. ודא באיזה מחשב אתה (`$env:COMPUTERNAME`) ושאתה בתיקיית הפרויקט (לא בתיקיית `G:\מחשבים אחרים\...`).
2. הרץ (PowerShell). אם המשתמשת נתנה הודעה — העבר אותה; אחרת כתוב הודעת commit קצרה באנגלית שמתארת מה השתנה (`git status`/`git diff --stat` מראים):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\deploy-site.ps1 -Message "<הודעת commit>"
   ```
   בלי `-Message` — מעלה את ה-HEAD כמו שהוא.
3. הסקריפט עושה: בדיקת main + לא-מאחור-מ-origin → `git add` רק לנתיבים מורשים (src, public, scripts, docs, קבצי תצורה — **לא** `git add -A`) → typecheck על `src/`+`scripts/` → push → ייצוא נקי של HEAD (`git checkout-index`) → `vercel deploy --prod --archive=tgz` → `vercel ls` + בדיקת HTTP 200.
4. דווח למשתמשת בעברית: מה עלה (HEAD + כתובת הפריסה), שהאימות עבר, ושצריך Ctrl+F5.

## מלכודות ידועות
- **סשנים מקבילים**: שינויים לא-committed של סשנים אחרים בתוך `src/` ייכנסו ל-commit (זה מכוון — "עדכון כולל"). אבל אם משהו שם לא גמור, הטיפוסים ייכשלו והסקריפט יעצור.
- **טבלאות/עמודות חדשות ב-`src/db/schema.ts`**: `drizzle-kit push` שבור כאן. צריך ליצור אותן ב-DB **לפני** הפריסה (ר' `scripts/create-fix-tables.ts` כדוגמה, SQL גולמי) — אחרת האתר החי יישבר.
- **העלאה ישירה בלי `--archive=tgz` נכשלת** ("fetch failed", סינון TLS). הסקריפט כבר משתמש ב-tgz.
- **פריסת "Blocked" אחרי ה-push** — צפויה ולא מזיקה.
- **למה זה חסום**: ה-repo פרטי ו-Hobby מאפשר רק לבעלים להיות כותב ה-commit (בגמח ה-repo ציבורי, לכן שם עובר).
- **התיקון הקבוע** (בידי המשתמשת, אחד מהשלושה): חיבור GitHub לחשבון הבעלים; או secret `VERCEL_TOKEN` ב-GitHub (ה-workflow `deploy-vercel.yml` כבר קיים ורדום); או repo ציבורי. אחרי אחד מהם `git push` לבד יעלה, והסקריפט הזה כבר לא הכרחי.
- חומרי לימוד (docx/PDF) **לא** עולים דרך הפקודה הזו — הם יושבים בדרייב/DB (ר' `CLAUDE.md`, סעיף "The local file here is NOT what the live site serves").
