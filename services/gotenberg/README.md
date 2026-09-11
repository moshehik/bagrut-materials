# שירות המרה Word/PowerPoint → PDF (Gotenberg + הגופנים האמיתיים)

תיקייה עצמאית, לא חלק מהאתר עצמו (Next.js/Vercel) — זו תשתית נפרדת שרצה
כקונטיינר משלה, כי Vercel Serverless לא יכול להריץ LibreOffice.

## למה זה קיים
Google Drive (הניסוי הראשון) המיר את הטקסט נכון אבל **איבד את הפונטים
המיוחדים** (FbPgisha/FbToccido/FbTrampolina) כי הם לא קיימים אצל גוגל.
כאן הפתרון: LibreOffice (בתוך Gotenberg) + הגופנים האמיתיים **מותקנים
בפועל** בתוך הקונטיינר עצמו — אז אין ניחוש/החלפה, LibreOffice פשוט
משתמש בגופן הנכון.

## פריסה ל-Render (חד פעמי, כמה דקות)
1. Render Dashboard → **New** → **Web Service**.
2. חברי את הריפו הזה של GitHub (אם הריפו עדיין לא מחובר ל-Render, זה
   יבקש הרשאה — לאשר).
3. **Root Directory**: `services/gotenberg` (חשוב! אחרת Render לא ימצא
   את ה-Dockerfile הזה, וינסה לבנות את כל האתר).
4. **Runtime**: Docker (אמור להתגלות אוטומטית מה-Dockerfile).
5. Instance type: Free (לבדיקה ראשונה) — אפשר לשדרג ל-Starter (~7$/חודש)
   אחר כך אם ה"הירדמות" של השכבה החינמית (~15 דק' ללא תנועה, אז כ-30-60
   שניות "התעוררות" לבקשה הבאה) תפריע בפועל.
6. **Deploy**. הבנייה לוקחת כמה דקות (המשקל הכי גדול הוא Gotenberg עצמו).
7. בסיום, Render נותן כתובת ציבורית כמו
   `https://<name>.onrender.com` — **זו הכתובת שצריך למסור בחזרה**
   כדי לחבר את זה לאתר (ייכנס כמשתנה סביבה `GOTENBERG_URL`).

## בדיקה ידנית שזה עובד (אחרי הפריסה)
```bash
curl -F "files=@some-file.docx" https://<name>.onrender.com/forms/libreoffice/convert -o out.pdf
```
אם `out.pdf` נפתח ורואים בו את הגופנים הנכונים — זהו, זה עובד.

## מה לא נמצא כאן
שום קוד של האתר עצמו. חיבור בפועל (קריאה מ-`/api/download`, `/api/preview`)
נעשה בקוד הראשי אחרי שיש URL אמיתי לבדוק מולו.
