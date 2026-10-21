# תשלום והפעלת מנוי דרך נדרים פלוס (`/pay`)

מורה מחוברת בוחרת מסלול (מנוי שנתי / ממלאת מקום 3 חודשים / ממלאת מקום יומית) ואת המקצועות, משלמת בטופס הסליקה המאובטח של
נדרים פלוס – והאתר מזהה את התשלום, מאמת אותו מול נדרים, ופותח לה **בדיוק את אותו מנוי שהקופה הישנה הייתה יוצרת** (שורות
`purchases`, תוקף מההורדה הראשונה, מכסות, קופון). נבנה 22.10.2026, ענף `feature/nedarim-payments`.

**מצב:** קוד בנוי, typecheck + בדיקות לוגיקה + build עוברים. **לא פרוס, הטבלאות לא נוצרו ב-Neon, אין עדיין מפתחות של נדרים.** ר' "מה חסר".

## עקרונות

1. **מספר הכרטיס לעולם לא עובר דרך השרת שלנו.** ההקלדה נעשית בתוך ה-iframe של נדרים (`https://matara.pro/nedarimplus/iframe`,
   תקן PCI). אנחנו שולחים ל-iframe רק פרטי מורה, סכום ומזהה בקשה ב-`postMessage` (`FinishTransaction2`) – בדיוק השדות של הדוגמה
   הרשמית `https://www.matara.pro/nedarimplus/iframe/sample2.html`. אין פרמטרים מומצאים.
2. **"הדפדפן אמר שהצליח" אינו ראיה.** המנוי נפתח רק אחרי אחד מאלה: (א) אימות מול היסטוריית העסקאות של המוסד
   (`Manage3.aspx` `GetHistoryJson`, מפתח `npk_`) – עסקה עם אותו `TransactionId` (או מזהה הבקשה בהערות), אותו סכום, ש"ח;
   (ב) אישור ידני של המנהלת ב-`/admin/payments`; (ג) רק אם `NEDARIM_TRUST_CALLBACK=1` – CallBack של נדרים בסכום הנכון.
3. **אידמפוטנטיות בלי טרנזקציות** (neon-http לא תומך בהן): `UPDATE nedarim_payments SET status='paid' WHERE status IN (pending,
   processing)` "תופס" את הבקשה, ורק הזוכה מכניס את שורות `purchases`. CallBack כפול / דפדפן + CallBack = מנוי אחד. כישלון אחרי
   התפיסה מחזיר ל-`processing` עם הודעה (המנהלת רואה "אמת מחדש").
4. **הסודות ב-env בלבד** – הריפו ציבורי.
5. הסכום נקבע **בשרת** (`getPlanPrices` + קופון פרטי), לא בדפדפן. הקופון נתפס רק בהשלמה (בקשה שלא שולמה לא "שורפת" אותו).

## הזרימה

```
מורה ---> GET /pay?plan=yearly&categories=1,2   (מחוברת; אחרת → /login?next=… / הרשמה)
       |   nedarim_enabled כבוי → redirect ל-/checkout (הקופה הישנה). /checkout?plan=… דולק → redirect ל-/pay.
       |  1. מסלול → מקצועות (שנתי 1–3 / 3 חודשים 1 / יומית בלי) + טלפון/עיר/תיכון אם חסרים
       |     ---> POST /api/pay/intent   → שורת nedarim_payments status=pending, reference=NP-XXXXXXXX
       |     <--- { reference, amount, finish (FinishTransaction2: Mosad, ApiValid, פרטים, Amount, Param1=reference, Param2=plan,
       |            Comment="לו״ז העניין - מנוי שנתי - NP-…", CallBack=https://<site>/api/pay/callback?key=SECRET) }
       |  2. iframe matara.pro (כרטיס/תוקף/CVV שם). "לתשלום" → postMessage FinishTransaction2 ; תשובה TransactionResponse
       |  3a. דפדפן ---> POST /api/pay/complete { reference, response }      (טריגר)
       |  3b. נדרים  ---> POST /api/pay/callback?key=SECRET (Param1=reference)  (webhook)
       v  4. verifyAndSettle (src/lib/nedarim/store.ts): GetHistoryJson → paid (verified, api) | processing ("ממתין לאימות")
          השלמה = buildPurchaseRows (כמו purchaseAction) + transactions (method="nedarim") + קופון + מייל templates.purchase
```

### איך המנוי מחובר למערכת הקיימת

`buildPurchaseRows` ב-`store.ts` מייצר את אותן שורות כמו `purchaseAction` (`src/lib/actions/purchase.ts`):
- **שנתי**: שורה לכל מקצוע ראשי (1–3), הסכום על הראשונה, `termDays=365`, `endsAt=NULL` (מתחיל בהורדה הראשונה – `reserveDownloads`);
  עם "דלג" – שורה אחת `subjectsPending=true`.
- **ממלאת מקום 3 חודשים**: מקצוע אחד, `termDays=90`, מכסה `PLANS.substitute_3m.downloadsLimit`.
- **ממלאת מקום יומית**: `categoryId=NULL`, `downloadsLimit=substitute_daily_downloads`, בלי תוקף.
- `purchases.payment_ref = NP-…` לכל השורות, `nedarim_payments.purchase_id` = הראשונה. השדרוג ל-/account/upgrade, הוספת מקצוע
  ב-/account/subjects, המכסות והמנויים בניהול – כולם עובדים על השורות האלה כרגיל. (purchaseAction לא שונה – כשההגדרה דולקת
  הוא כבר לא מקבל מסלולי מנוי, כי /checkout מפנה ל-/pay.)

### נטפרי (אילוץ מרכזי – ר' CLAUDE.md)

נטפרי מסנן לפי רשימת אתרים מאושרים; אצל חלק מהמורות הדפדפן חסום לכל דומיין שאינו האתר. ה-iframe נטען מ-`matara.pro` (דומיין
צד-שלישי) ולכן **עלול לא להיטען בלי שום שגיאה**. מה בדקתי: דף הדוגמה וה-iframe של נדרים טוענים רק `matara.pro` + Google Fonts;
אין proxy/redirect same-origin אפשרי – ה-iframe חייב לרוץ ב-origin של נדרים (PCI, ה-postMessage שלהם עונה ל-`event.origin`, וכל
בקשות הסליקה שבתוכו הולכות ל-matara.pro). גם דף התשלום המתארח של נדרים הוא באותו דומיין. לא מצאתי אישור פומבי שנדרים פלוס
פתוח בנטפרי (סביר – הוא נפוץ מאוד במגזר – אבל לא מאומת). לכן:
- בעמוד התשלום יש שעון: אם ה-iframe לא ענה `Height` תוך 12 שניות (או לחיצה על "הטופס לא נטען אצלך?") מוצגת חלופה: ניסיון
  חוזר, הסבר ("לבקש מהסינון לפתוח את matara.pro"), וכפתור **"להשלים את התשלום דרך המנהלת"** → `POST /api/pay/assist`: הבקשה
  נשארת פתוחה ומסומנת, המנהלת מקבלת מייל (`templates.payAssistAdmin`), ואחרי שהתשלום מתקבל בדרך אחרת – "אשר ידנית" פותח את המנוי.
- **לבדוק בפועל** עם מורה שגולשת בנטפרי מיד אחרי הפריסה הראשונה, ואם חסום – לבקש מנטפרי לפתוח את `matara.pro` (זה הפתרון האמיתי).

## קבצים

| קובץ | תפקיד |
|---|---|
| `src/lib/nedarim/logic.ts` | לוגיקה טהורה (בלי imports): מזהה בקשה, FinishTransaction2, פענוח CallBack, התאמה להיסטוריה, החלטת השלמה, טקסטים. נבדק ב-`scripts/nedarim-tests/logic.test.ts` |
| `src/lib/nedarim/config.ts` | env + ההגדרה `nedarim_enabled`; `missing` = מה חסר; `callbackUrl` |
| `src/lib/nedarim/manage.ts` | `GetHistoryJson` (Manage3, מפתח npk_) |
| `src/lib/nedarim/store.ts` | DB: יצירת בקשה, דיווחים, אימות, השלמה אידמפוטנטית (`buildPurchaseRows`), אישור ידני, ביטול, בקשת סיוע, פקיעה |
| `src/app/pay/page.tsx`, `src/components/pay/pay-client.tsx` | העמוד (4 שלבים, עיצוב "שער" כמו השלמת הרשמה, חלופת נטפרי, מצב דמה) |
| `src/app/api/pay/{intent,complete,callback,status,assist}/route.ts` | ה-API (מחוברות בלבד חוץ מ-callback שמוגן בסוד) |
| `src/app/admin/payments/page.tsx`, `src/components/admin/nedarim-payment-row.tsx`, `src/lib/actions/nedarim-admin.ts` | מסך "תשלומים (נדרים)": מצב החיבור, רשימה, יומן, אמת מחדש / אשר ידנית / ביטול |
| `src/db/schema.ts` (`nedarimPayments`, `nedarimPaymentEvents`), `scripts/create-nedarim-tables.ts` | הסכמה וה-SQL (dry-run כברירת מחדל, `--apply` מריץ) |
| `src/lib/settings.ts` (`nedarim_enabled`), `src/lib/mail.ts` (`payAssistAdmin`), `src/components/admin/admin-nav.tsx`, `src/app/checkout/page.tsx` (redirect) | רישומים |

## משתני סביבה (Vercel ×3 סביבות + .env.local; Redeploy אחרי שינוי)

| משתנה | מה |
|---|---|
| `NEDARIM_MOSAD_ID` | קוד המוסד בנדרים פלוס |
| `NEDARIM_API_VALID` | ה-ApiValid של ה-iframe שנדרים מסרו למוסד |
| `NEDARIM_API_PASSWORD` | מפתח `npk_…` (reports.matara.pro > הגדרות > API) – האימות האוטומטי. בלעדיו כל תשלום מחכה ל"אשר ידנית" |
| `NEDARIM_CALLBACK_SECRET` | מחרוזת אקראית ארוכה (למשל `openssl rand -hex 24`); חלק מכתובת ה-CallBack |
| `NEDARIM_TRUST_CALLBACK=1` | (לא מומלץ) להשלים לפי CallBack בלי API |
| `NEDARIM_SIMULATE=1` | **פיתוח בלבד**: העמוד פעיל בלי ההגדרה, כפתור "סימולציית תשלום מוצלח" משלים בלי נדרים (`verify_method=simulated`, `verified=false`) |

הדלקה: `/admin/settings` → קבוצה "תשלומים" → "תשלום בכרטיס אשראי דרך נדרים פלוס". כבוי = הקופה הישנה ממשיכה לעבוד.

## איך בודקים

1. **לוגיקה:** `npx tsx --test scripts/nedarim-tests/logic.test.ts` (7 בדיקות). typecheck: `npx tsc --noEmit`.
2. **מקומית עם DB בדיקה** (לא על Neon של הפרודקשן!): `npx tsx scripts/create-nedarim-tables.ts --apply`, `NEDARIM_SIMULATE=1`,
   `npm run dev`, `/pay?plan=yearly`, "המשך לתשלום", "סימולציית תשלום מוצלח" → `/admin/payments` שורה `שולם (סימולציה)`,
   מנוי חדש ב-`/admin/subscriptions`, תנועה ב-`/admin/finance`. **טופס נדרים לא מקבל postMessage מ-localhost** – הסליקה האמיתית
   רק מהדומיין של האתר.
3. **בפרודקשן (אחרי אישור פריסה):** SQL ב-Neon → env → Redeploy → הדלקת ההגדרה → תשלום אמיתי בסכום קטן (אפשר להוריד זמנית את
   `price_yearly`) → השורה ב-"תשלומים (נדרים)" צריכה להגיע ל-`שולם` עם "אומת מול נדרים פלוס"; ה-CallBack ביומן; המנוי ב-"מנויים".
   אם נשארה "ממתין לאימות" – "אמת מחדש"; בלי מפתח API – "אשר ידנית" אחרי בדיקה בפורטל. ואז: לקרוא את `callback_body` ביומן ולכוון
   את `extractTransactionFields` לשמות השדות האמיתיים.

## מה חסר / שאלות פתוחות למשה

1. **מנדרים פלוס:** `ApiValid` של ה-iframe, מפתח `npk_` (API), ואישור שקוד המוסד נכון. עד אז – מצב דמה בלבד.
2. **הרצת ה-SQL ב-Neon לפני ה-push** (`npx tsx scripts/create-nedarim-tables.ts --apply`) – push מפרס מיד.
3. **כתובת ה-CallBack לרישום אצל נדרים** (אם בפורטל יש הגדרה קבועה למוסד): `https://bagrut-materials.vercel.app/api/pay/callback?key=<NEDARIM_CALLBACK_SECRET>`.
   היא גם נשלחת בכל עסקה בשדה `CallBack`.
4. **השדות של ה-CallBack אינם מתועדים** – הקוד שומר גוף גולמי ומחלץ `Param1`/`TransactionId`/`Amount`/`Status`/`Confirmation`/`LastNum`
   בסובלנות; לכוון אחרי העסקה הראשונה. גם `GetHistoryJson` (`LastId`/`MaxId`, שמות העמודות) לפי ההבנה מגמ"ח – לא אומת.
5. **תשלומים (Tashlumim):** נשלח תמיד `1` (חיוב אחד). בעמוד המחירים כתוב "12 תשלומים · חיוב אחד" – אם רוצים פריסה אמיתית לתשלומים
   בכרטיס, לשנות `Tashlumim` ב-`buildFinishTransactionValue` (נדרים תומכים).
6. **שדרוג ממלאת מקום → שנתי** (`/account/upgrade`) עדיין עובר דרך הקופה המדומה (`upgradeToYearlyAction`, `MOCK-UPG-…`) – לא חובר לנדרים.
7. **רכישה בודדת / תיקייה (single/bundle)** – לא חוברו; `/pay` מוכר רק מסלולי מנוי. אם רוצים – אותו מנגנון עם `purpose` נוסף.
8. בדיקה בדפדפן מול iframe אמיתי לא בוצעה (אין מפתחות, ואין localhost). הפרוטוקול נלקח מהדוגמה הרשמית של נדרים.
