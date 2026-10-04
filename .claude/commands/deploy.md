---
description: מעלה עדכון לאתר החי (bagrut-materials.vercel.app) בפקודה אחת — בדיקת טיפוסים, commit, push, פריסה ל-Vercel מעותק נקי, ואימות שהאתר עלה.
argument-hint: "[הודעת commit קצרה] — אפשר להשאיר ריק אם הכול כבר committed"
---

המשתמשת ביקשה להעלות את העדכונים לאתר. **ההרצה של `/deploy` עצמה היא האישור לפריסה לפרודקשן** — אין צורך לשאול שוב.

## הכלל (מ-2026-10-04)
ה-repo ציבורי (כמו הגמח), ולכן `git push` אמור להעלות את האתר לבד. `/deploy` הוא הנתיב המהיר/הגיבוי: משתמשים בו כשרוצים להעלות מיד מהמחשב, או כש-push שוב מסומן "Blocked" ב-`vercel ls`. תמיד לאמת ב-`vercel ls` — אל תכתוב "הועלה" בלי לראות Ready.

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
- **סשנים מקבילים**: שינויים לא-committed של סשנים אחרים בתוך `src/` ייכנסו ל-commit (זה מכוון — "עדכון כולל"). אם משהו שם לא גמור, הטיפוסים ייכשלו והסקריפט יעצור.
- **טבלאות/עמודות חדשות ב-`src/db/schema.ts`**: `drizzle-kit push` שבור כאן. ליצור ב-DB **לפני** הפריסה (ר' `scripts/create-fix-tables.ts`), אחרת האתר החי יישבר.
- **העלאה ישירה בלי `--archive=tgz` נכשלת** ("fetch failed", סינון TLS). הסקריפט כבר משתמש ב-tgz.
- **ה-repo ציבורי**: לעולם לא לעשות commit לסודות/`.env`/סיסמאות.
- חומרי לימוד (docx/PDF) **לא** עולים דרך הפקודה הזו — הם יושבים בדרייב/DB (ר' `CLAUDE.md`, "The local file here is NOT what the live site serves").
