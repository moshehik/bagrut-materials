# מענה לפניות "צרי קשר" ישירות למייל של הפונה (2026-11-10)

**סטטוס: נבנה מקומית בלבד. לא נפרס, ה-DDL לא הורץ ב-Neon, לא נשלח מייל אמיתי.**

## זרימה
1. הפונה שולחת טופס ב-`/contact` ← `contactAction` ([actions/mail.ts](../src/lib/actions/mail.ts)): אימות + הגבלת קצב, **ואז שמירת הפנייה** (`contact_inquiries` + הודעת `in` ב-`contact_inquiry_messages`), ולבסוף המייל הקיים למנהלת (`templates.contact`). כשל בשמירה (למשל הטבלה עוד לא קיימת) נרשם ב-`console.error` ולא מפיל את הפנייה; המייל נשלח כרגיל. קשר ל-`user_id` רק אם המשתמשת מחוברת וכתובת המייל זהה.
2. המייל למנהלת מתחיל ב-"השיבי ישירות ל: <כתובת הפונה>" ובכפתור/קישור "מענה מהאתר" אל `/admin/inquiries?id=<id>` (רק אם הפנייה נשמרה).
3. המנהלת עונה ב-`/admin/inquiries`: `replyToInquiryAction` שולחת `sendMail({to: <מייל הפונה>, kind: "inquiry-reply"})` בטקסט רגיל + חתימה "צוות לו״ז העניין", שומרת הודעת `out` (`sent_ok`, `email_log_id`), ומעדכנת `status=answered`, `answered_at/by`, `logAudit("inquiry.reply")`. **שליחה שנכשלה**: מוצגת שגיאה, הסטטוס לא משתנה, והניסיון נשמר בשיחה כ"לא נשלח".
4. `setInquiryStatusAction`: סגירה בלי מענה / ספאם / החזרה להמתנה (לא נוגע ב-`answered_at`).

## קבצים
- [schema.ts](../src/db/schema.ts): `contactInquiries`, `contactInquiryMessages`.
- [scripts/create-inquiries-tables.ts](../scripts/create-inquiries-tables.ts): DDL. **dry-run כברירת מחדל**, `--apply` יוצר בפועל (`IF NOT EXISTS`).
- [src/lib/inquiry-logic.ts](../src/lib/inquiry-logic.ts) (לוגיקה טהורה) + [inquiry-templates.ts](../src/lib/inquiry-templates.ts) (4 תבניות תשובה).
- [src/lib/actions/inquiries.ts](../src/lib/actions/inquiries.ts): פעולות השרת.
- [src/app/admin/inquiries/page.tsx](../src/app/admin/inquiries/page.tsx) + [src/components/admin/inquiry-reply-form.tsx](../src/components/admin/inquiry-reply-form.tsx): הדף (עיצוב לפי `_design-sketches/admin-inquiries-site-style.html`: gate-panel / gate-card / gold-ring / sicha-tag).
- שינויים קטנים: פריט "פניות" ב-[admin-nav.tsx](../src/components/admin/admin-nav.tsx), ספירת ממתינות כתג בתפריט ב-[admin/layout.tsx](../src/app/admin/layout.tsx) (`safeCount` – 0 אם הטבלה חסרה), `templates.contact` ב-[mail.ts](../src/lib/mail.ts).
- בדיקות: `npx tsx --test scripts/inquiries-logic.test.ts`.

## להפעלה (לפני פריסה)
1. `npx tsx scripts/create-inquiries-tables.ts` (לבדוק את ה-SQL) ואז `--apply` ב-Neon. בלי זה הדף מציג "טבלת הפניות עוד לא נוצרה" והפניות ממשיכות להגיע במייל.
2. פריסה רגילה (`git push`).

## מגבלה: replyTo
סקריפט ה-Apps Script של המייל ([google-apps-script.gs](google-apps-script.gs), והסקריפט החי) **לא תומך ב-`replyTo`**, ואסור לערוך אותו (ר' [mail-script.md](mail-script.md)). לכן התשובה יוצאת מכתובת האתר, ואם הפונה משיבה, התשובה מגיעה לתיבת ה-Gmail של האתר ולא למנהלת אישית. הדף אומר זאת במפורש מעל כפתור השליחה. אם רוצים שתשובות הפונות יגיעו למנהלת ישירות: להוסיף `options.replyTo = data.replyTo` ב-`GmailApp.sendEmail` בסקריפט (מהחשבון החדש בלבד, New version) ולשלוח `replyTo` מ-`sendMail`; או להוסיף העברה אוטומטית (forwarding) בתיבת האתר. החלטה של המנהלת.

## מה נבדק ומה לא
נבדק: בדיקות יחידה ללוגיקה, טיפוסים, תצוגת הדף בדפדפן במצב "הטבלה לא קיימת" (ראי סיכום הסוכן). **לא נבדק:** שמירה/קריאה מול Neon אמיתי, שליחת תשובה אמיתית, `formAction` של כפתורי הסטטוס מול DB חי, תצוגת הרשימה והשיחה עם נתונים.

## הערה על CLAUDE.md
בזמן הבנייה היו ב-`CLAUDE.md` שינויים לא-שלי (uncommitted, סשן אחר), ולכן לא נוספה אליו פסקה. אפשר להוסיף שורה: "פניות צרי קשר נשמרות ב-`contact_inquiries` ונענות מ-`/admin/inquiries` (ר' docs/inquiries.md)".
