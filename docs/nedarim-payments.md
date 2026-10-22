# תשלום והפעלת מנוי דרך נדרים פלוס (`/pay`)

מורה מחוברת בוחרת מסלול (מנוי שנתי / ממלאת מקום 3 חודשים / ממלאת מקום יומית) ואת המקצועות, **מופנית לדף התשלום המתארח של
נדרים פלוס** (`https://www.matara.pro/nedarimplus/online/?mosad=<קוד המוסד>`) עם הסכום נעול ופרטייה ממולאים – והאתר מזהה את
התשלום בהיסטוריית העסקאות של המוסד (API של נדרים) ופותח לה **בדיוק את אותו מנוי שהקופה הישנה הייתה יוצרת** (שורות `purchases`,
תוקף מההורדה הראשונה, מכסות, קופון, מייל אישור). האתר לא מחייב ולא מקבל פרטי כרטיס בשום שלב. ענף `feature/nedarim-payments`.

**מצב (22.10.2026):** קוד בנוי; typecheck, בדיקות יחידה ו-`next build` עוברים. **לא פרוס, הטבלאות לא נוצרו ב-Neon, לא בוצעה
קריאה אמיתית לנדרים.** ר' "מה חסר".

## עקרונות

1. **אין iframe ואין ApiValid.** הניווט לדף של נדרים הוא ניווט רגיל של הדפדפן (לשונית חדשה). matara.pro פתוח בנטפרי (אומת ע"י משה).
2. **"הדפדפן אמר שהצליח" לא קיים בכלל.** המנוי נפתח רק כשעסקה מתאימה נמצאת ב-`GetHistoryJson` של המוסד (מפתח `npk_`), או
   באישור ידני של המנהלת. CallBack (אם מגדירים בפורטל נדרים) רק מפעיל רענון – לא משלים.
3. **מגבלת ה-API (20 קריאות בשעה למוסד) נאכפת בשער גלובלי** (`src/lib/nedarim/sync.ts`): שורה יחידה `nedarim_sync_state` עם
   נעילה אטומית, מרווח מינימלי (4 דק' ל-polling; 3 דק' ל"שילמתי" ול-CallBack; דקה למנהלת/בדיקת מפתח), **מונה שעתי גלובלי
   ≤18 קריאות מכל הסיבות** (באותו UPDATE אטומי), `LastId` אינקרמנטלי, backoff מעריכי בשגיאה. polling של מורות לעולם לא קורא
   ל-API ישירות.
4. **אידמפוטנטיות בלי טרנזקציות** (neon-http): תפיסת העסקה (`matched_payment_id IS NULL → id`) → תפיסת הבקשה (UPDATE מותנה על
   הסטטוס; אינדקס ייחודי חלקי על `transaction_id` של בקשות `paid`) → רק הזוכה מכניס שורות `purchases`. עסקה אחת = בקשה אחת.
5. **הסודות מוצפנים ב-DB או ב-env בלבד** (הריפו ציבורי). הסכום נקבע **בשרת** ונעול בקישור; אי אפשר לשנות plan/amount/מקצועות
   אחרי יצירת הבקשה (אין endpoint שמעדכן אותם).

## הזרימה

```
מורה ---> GET /pay?plan=yearly&categories=1,2   (מחוברת; אחרת → /login?next=… / הרשמה)
       |   nedarim_enabled כבוי → redirect ל-/checkout (הקופה הישנה). /checkout?plan=… דולק → redirect ל-/pay.
       |  1. מסלול → מקצועות (שנתי 1–3 / 3 חודשים 1 / יומית בלי) + טלפון/עיר/תיכון אם חסרים
       |     ---> POST /api/pay/intent → שורת nedarim_payments status=pending, reference=NP-XXXXXXXX (אקראי קריפטוגרפי)
       |     <--- { reference, amount, hostedUrl }   (הכתובת הופכת ל-/pay?ref=NP-…)
       |  2. לשונית חדשה: דף התשלום של נדרים (Amount נעול, ClientName/Phone/Email ממולאים, comment+Analytic = מזהה הבקשה,
       |     Redirect חזרה ל-/pay?ref=…). ההקלדה של הכרטיס – שם בלבד.
       |  3. דף ההמתנה: polling GET /api/pay/status כל 30 שנ' (מפעיל את השער – קריאה אמיתית לכל היותר פעם ב-4 דק'),
       |     כפתור "שילמתי – בדקי עכשיו" (POST /api/pay/check – רצפה 3 דק'), "לפתוח שוב את דף התשלום", פנייה למנהלת (assist).
       v  4. sync.refreshHistory → nedarim_transactions (מטמון) → matchPendingPayments → settleFromTransaction:
          purchases (buildPurchaseRows, כמו purchaseAction) + transactions (method="nedarim") + קופון + templates.purchase
```

### ההתאמה (logic.ts: `findCandidates`, `decideAutoMatches`)

מועמדת לבקשה: עסקה **מאושרת** (יש `Confirmation` לא ריק; אם יש שדה סטטוס – רק ערך הצלחה מוכר, ערך לא מוכר = לא מאושר – H1),
**סכום זהה בדיוק** (אגורות), ש"ח, עסקה שלא שויכה, **עם מועד עסקה מפוענח** (`TransactionTime`, שעת ירושלים; בלי מועד – לא
מועמדת – M3), שאינו לפני יצירת הבקשה פחות 15 דק' ואינו לפני **מועד החיתוך** (`nedarim_sync_state.cutoff_at` = רגע ההדלקה;
עסקאות היסטוריות לעולם לא מתאימות). בקשות ישנות מ-48 שעות לא נבדקות (פגות).
- **strong** – מזהה הבקשה `NP-…` מופיע בהערת העסקה (`Comments`; נשלח גם ב-`comment` וגם ב-`Analytic`). **בדיוק אחת, שלא
  מתאימה לבקשה אחרת → מנוי.** יותר → אישור ידני.
- **weak** – טלפון מנורמל זהה **או** מייל זהה (סכום זהה, בלי מזהה בהערה – למשל פתחה את דף נדרים בלי הקישור שלנו). **לא משדרג
  אוטומטית** (החלטה L4): הבקשה עוברת ל"ממתין לאישור ידני" עם מספרי העסקאות המועמדות, והמנהלת מאשרת עם מספר העסקה (שנבדק
  מול הבקשה – M1). למה: טלפון/מייל בדף של נדרים ניתנים להזנה חופשית, ושתי מורות מאותו טלפון/מוסד באותו סכום הן תרחיש אמיתי;
  המסלול הרגיל (הערה נעולה בקישור) מכוסה ע"י strong. התאמת שם (ClientName) לא נבחרה – כתיב חופשי בעברית אינו אמין.
- כל ספק → הבקשה `processing` ("ממתין לאישור ידני") עם הסיבה ומספרי העסקאות. סכום שונה/חלקי, מטבע אחר, זיכוי (שלילי), ביטול (0),
  עסקה בלי אישור – לעולם לא מתאימים (גם לא ידנית בלי אישור חריג מפורש). בקשה שביקשה עזרה (assist) יוצאת מההתאמה האוטומטית.
- **אישור ידני עם מספר עסקה** (M1): אם העסקה במטמון – חייבת להיות מאושרת, בסכום זהה, חיובית, בש"ח; אחרת סירוב. "אשר כחריג
  בכל זאת" = אישור מפורש נוסף, נרשם באודיט (`nedarim.manual_settle_override`) עם הסכומים וביומן הבקשה. מספר עסקה שאינו
  במטמון = אישור על אחריות המנהלת (`manual_unverified`).
- **סדר ההשלמה** (M2/M5, `settlementPlan`): תפיסת הבקשה → תפיסת הקופון (נכשל → חזרה ל-processing "הקופון כבר נוצל", בלי
  מנוי) → אם כבר קיימות שורות purchases לבקשה (purchase_id או payment_ref) – לא מכניסים שוב → insert → **מכאן כל כישלון
  (תנועה כספית, מייל) משאיר paid + אירוע error**. בקשה חדשה עם קופון שכבר יש לו בקשה פתוחה של אותה משתמשת – משתמשים בקיימת.
  עסקה שנתפסה ל-settle שלא הושלם ע"י אותה קריאה (כולל "כבר טופל") משוחררת (L1).

### פרמטרי דף התשלום המתארח – מה נמצא

אין תיעוד רשמי פומבי לדף. הפרמטרים אומתו ב-**קוד הדף עצמו** (`/nedarimplus/online/Files/JavaScript5.js`, הפונקציות
`GetURLParameter`/`DecodeParam`) ותואמים לתיעוד ה-API שנדרים מוסרים למפתחים (עותק ציבורי: `seedlinggary/kty-frontend`,
`NedarimPlus-API.md`):
`mosad` (חובה), `Amount`, `AmountLock`, `Payment`, `PaymentLock`/`tashlumlock`, `Day`, `ClientName`, `Phone`, `Email`, `Street`,
`City`, `Zeout`, `Bank`/`Snif`/`Account`, `groupe`, `groupelock`, `comment` (ממלא **ונועל** את ההערה), `avour` (ממלא) + `avourlock`,
`CustomAvour`, `CustomKoteret`, `Analytic` (מצורף לתחילת הערת העסקה עם " | "), `Redirect` (אחרי תשלום מוצלח), `TakanonChecked`,
`logo`, `HideParameters`, `currency`, `OnlyShekel`/`OnlyDollar`/`ForceDollar`, `Language`/`lang`, `NormalDefault`/`KevaDefault`,
`OnlyNormal`/`onlykeva`/`onlymasav`/`OnlyBit`/`OnlyDigitalTransfer`/`OnlyCrypto`, `CRM`, `S`, `MatrimId`, `device`.
**אין** פרמטר CallBack ואין Param1/Param2 בדף – לכן הזיהוי דרך ההערה. מה שאנחנו שולחים (`hostedPaymentUrl`): `mosad`, `Amount`,
`AmountLock=1`, `Payment=1`, `PaymentLock=1`, `OnlyNormal=1`, `OnlyShekel=1`, `ClientName`, `Phone`, `Email`, `comment`, `Analytic`,
`Redirect`, `HideParameters=1`. לא שולחים: Groupe, Street/City, Zeout, TakanonChecked (המורה מאשרת תקנון בעצמה).

### GetHistoryJson – מה הונח

`POST https://matara.pro/nedarimplus/Reports/Manage3.aspx` עם `Action=GetHistoryJson, ApiPassword, MosadId, LastId (exclusive),
MaxId (≤2000)`; תשובה: מערך עם `TransactionId, Amount, Currency (1=ש"ח), Phone, Mail, Comments, TransactionTime, ClientName,
Confirmation, LastNum, …` (לפי התיעוד הנ"ל). עסקאות מבוטלות = `Amount` 0; זיכויים = שורות נפרדות בסכום שלילי. `parseHistoryRow`
סובלני לשמות קרובים; תאריך בלי offset מפוענח כ-**Asia/Jerusalem** (Intl, כולל שעון קיץ, בלי תלות ב-TZ של השרת). **לא אומת מול
תשובה אמיתית** – אחרי הקריאה הראשונה לבדוק את `raw` ב-`nedarim_transactions` (נשמרים רק `RAW_KEEP_FIELDS`: מזהה, סכום, מטבע,
הערה, מועד, אישור, 4 ספרות, סטטוס, סוג, קטגוריה, תשלומים, מס' קבלה – **בלי ת"ז/כתובת/שם**; לא-משויכות ישנות מ-30 יום נמחקות
בכל רענון). הקריאה הראשונה (בלי LastId) מתחילה מהעסקה הראשונה של המוסד – ההיסטוריה "נגללת" ב-2000 שורות לקריאה; עסקאות
שקדמו ל-`cutoff_at` לעולם לא מתאימות, אז זה רק עניין של זמן עד שהמטמון מדביק את ההווה.

## קבצים

| קובץ | תפקיד |
|---|---|
| `src/lib/nedarim/logic.ts` | לוגיקה טהורה: מזהה בקשה, `hostedPaymentUrl`, `parseHistoryRow`, `findCandidates`/`decideAutoMatches`, CallBack, טקסטים. נבדק ב-`scripts/nedarim-tests/logic.test.ts` |
| `src/lib/nedarim/sync.ts` | שער הקריאה הגלובלי + מטמון העסקאות + `matchPendingPayments` |
| `src/lib/nedarim/store.ts` | DB: יצירת בקשה, `settleFromTransaction` / `manualSettle` / `simulatedSettle` (השלמה אידמפוטנטית, `buildPurchaseRows`), ביטול, סיוע, CallBack, פקיעה |
| `src/lib/nedarim/manage.ts` | `GetHistoryJson` (Manage3) – נקרא רק מהשער |
| `src/lib/nedarim/config.ts`, `hosted.ts` | קונפיגורציה (env + הגדרה + סודות), בניית הקישור לבקשה |
| `src/lib/nedarim/secret-crypto.ts`, `secrets.ts` | הצפנת סודות (AES-256-GCM, HKDF), `getNedarimApiPassword`, `redactNedarim`; `getSecretStatus` מנסה לפענח ומציג "לא ניתן לפענוח – להזין מחדש" (L5). נבדק ב-`secret-crypto.test.ts` |
| `src/app/pay/page.tsx`, `src/components/pay/pay-client.tsx` | העמוד (מסלול → פרטים → המתנה → סיום) |
| `src/app/api/pay/{intent,status,check,assist,callback}/route.ts` | ה-API (מחוברות + בעלות על הבקשה + same-origin; callback מוגן בסוד) |
| `src/app/admin/payments/page.tsx`, `src/components/admin/nedarim-{payment-row,sync-card,secrets-card}.tsx`, `src/lib/actions/nedarim-admin.ts` | מסך "תשלומים (נדרים)": מצב, שער הקריאה + "רענון עכשיו" + עסקאות לא משויכות, סודות (החלפה/בדיקה/הסרה), רשימה, יומן, "בדוק שוב" / "אשר ידנית" (עם מספר עסקה) / ביטול |
| `src/db/schema.ts`, `scripts/create-nedarim-tables.ts` | `nedarim_payments`, `nedarim_payment_events`, `nedarim_sync_state`, `nedarim_transactions`, `app_secrets` + ה-SQL (dry-run כברירת מחדל, `--apply`) |
| `src/lib/settings.ts` (`nedarim_enabled`), `src/lib/mail.ts` (`payAssistAdmin`), `src/lib/agentEvents.ts` (redaction), `src/lib/http-utils.ts` (`isSameOriginRequest`), `next.config.ts` (no-store), `src/components/admin/admin-nav.tsx`, `src/app/checkout/page.tsx` (redirect) | רישומים |

## הגדרות וסודות

| איפה | מה |
|---|---|
| `NEDARIM_MOSAD_ID` (env) | קוד המוסד – לא סוד (מופיע בקישור לדף התשלום) |
| מפתח API `npk_…` | **מוחלף מהאתר** (/admin/payments → "סודות נדרים פלוס", מוצפן ב-`app_secrets`) או env `NEDARIM_API_PASSWORD`. ה-DB גובר |
| סוד CallBack (אופציונלי, ≥32 תווים) | מהאתר או env `NEDARIM_CALLBACK_SECRET`; כתובת: `https://<site>/api/pay/callback` + כותרת `X-Nedarim-Key: <סוד>` (עדיף) או `?key=<סוד>` |
| `NEDARIM_SECRETS_KEY` (env, מומלץ, ≥32 תווים אקראיים) | הסוד הראשי להצפנת `app_secrets`; בלעדיו נגזר מ-`SESSION_SECRET` (HKDF עם תווית נפרדת). החלפתו = הסודות ב-DB לא ניתנים לפענוח – להזין מחדש |
| `NEDARIM_SIMULATE=1` | **פיתוח מקומי בלבד** (לא ב-Vercel – נבדק גם `VERCEL`/`VERCEL_ENV`): "סימולציית תשלום מוצלח" משלימה בלי נדרים (`verify_method=simulated`) |
| `nedarim_enabled` | /admin/settings → "תשלומים". כבוי = הקופה הישנה |

### הצפנת הסודות (`secret-crypto.ts`)
AES-256-GCM, מפתח 32 בתים מ-HKDF-SHA256(master, salt "app_secrets", info "luz-haninyan:app-secrets:aes-256-gcm:v1"), IV אקראי 12 בתים
לכל כתיבה, AAD = שם הסוד (blob של סוד אחד לא ניתן להעברה לשם אחר), פורמט `base64(version‖iv‖tag‖data)`. ב-DB נשמרים גם 4 התווים
האחרונים לתצוגה. הערך הגולמי: לא מוחזר ללקוח, לא באודיט (רק שם + last4), לא ביומן, לא בשגיאות (`redactNedarim`: כל `npk_…`,
`key=…`, וכל ערך סוד ידוע). השוואת סוד ה-CallBack: SHA-256 של שני הצדדים + `timingSafeEqual`.

## איך בודקים

1. **יחידה:** `npx tsx --test scripts/nedarim-tests/logic.test.ts scripts/nedarim-tests/secret-crypto.test.ts` (13 בדיקות: קישור,
   פענוח היסטוריה, התאמה חזקה/חלשה/ספק/עסקה של אחרת/זיכוי/סכום חלקי, הצפנה/פענוח, tag פגום, AAD, redaction). typecheck: `npx tsc --noEmit`.
2. **מקומית עם DB בדיקה** (לא Neon של הפרודקשן): `npx tsx scripts/create-nedarim-tables.ts --apply`, `NEDARIM_SIMULATE=1`,
   `npm run dev`, `/pay?plan=yearly` → "המשך לתשלום" → "סימולציית תשלום מוצלח" → `/admin/payments` שורה `שולם (סימולציה)`, מנוי
   ב-`/admin/subscriptions`, תנועה ב-`/admin/finance`.
3. **בפרודקשן (אחרי אישור פריסה):** SQL ב-Neon → `NEDARIM_MOSAD_ID` (+ `NEDARIM_SECRETS_KEY`) ב-Vercel → Redeploy → הזנת מפתח
   ה-API במסך הניהול → "בדיקת מפתח" (קריאה אחת) → הדלקת ההגדרה → **תשלום אמיתי בסכום קטן דרך קופון פרטי** (L7: ליצור
   ב-/admin/coupons קופון אחוזי גבוה למשתמשת בדיקה – כך הסכום מוזל רק לה, בלי לגעת ב-`price_yearly` לכולן) → "שילמתי – בדקי
   עכשיו" → השורה צריכה להגיע ל-`שולם – הותאם לעסקה`. אם נשארה "ממתין לאישור ידני" – לבדוק את `raw` של העסקה במטמון (שמות
   השדות, במיוחד `Confirmation`/`TransactionTime`) ולאשר ידנית עם מספר העסקה.

## אבטחה – מה נבדק (22.10.2026)

| סעיף | מצב |
|---|---|
| callback: השוואת סוד באורך קבוע (hash+timingSafeEqual), rate-limit IP, גודל גוף, תשובה אחידה, לא משלים לבדו, לוג בלי סודות, תמיכה בכותרת | **תקין / תוקן** (SHA-256 compare; `X-Nedarim-Key` מועדף, `?key=` נתמך רק כגיבוי; רצפת רענון 3 דק' כמו למורות – L2). **סיכון פתוח:** `?key=` בשורת הכתובת מופיע בלוגי הגישה של Vercel – להעדיף כותרת אם הפורטל של נדרים מאפשר; וממילא ה-callback לא משדרג |
| סקירה 2 (22.10.2026): H1 עסקה לא-מאושרת, M1 אישור ידני בסכום שונה, M2 קופון, M3 עסקאות היסטוריות/בלי מועד, M4 אזור זמן, M5 purchases כפולים, L1 שחרור עסקה, L3 מונה שעתי, L5 סוד לא-ניתן-לפענוח, L6 פקיעה בסטטוס, M6 raw מצומצם + ניקוי, L4 weak | **תוקן** – ר' "ההתאמה" למעלה; בדיקות יחידה לכל סעיף חובה ב-`logic.test.ts` (H1/M1/M2+M5/M3/M4/L4) |
| intent/status/check/assist: authz (רק בעלת הבקשה; IDOR לפי reference), CSRF/origin, rate-limit, zod, מחיר מהשרת, אין שינוי אחרי יצירה, reference אקראי | **תקין / תוקן** (נוסף `isSameOriginRequest` ל-POST; reference 8 תווים מ-32 = 40 ביט + בעלות) |
| idempotency/races: השלמה כפולה, שני רענונים במקביל, קופון כפול, סכום שונה/חלקי, מטבע, replay של עסקה | **תוקן:** נעילת השער; תפיסת העסקה ואז הבקשה; אינדקס ייחודי חלקי; קופון UPDATE מותנה; סכום חייב להיות זהה; `isIls`. **סיכון פתוח:** זיכוי אחרי "שולם" לא מבטל מנוי אוטומטית (שורת זיכוי שלילית נשארת לא-משויכת; המנהלת מבטלת ב«מנויים») |
| postMessage / iframe / CSP frame-src | **לא רלוונטי** (אין iframe). frame-ancestors 'self' הגלובלי נשאר |
| PCI | **תקין** – שום נתון כרטיס לא עובר/נשמר; `last4` רק מהיסטוריית נדרים |
| אדמין: requireAdmin, XSS, מייל | **תקין** – כל action דרך `admin()`; אין `dangerouslySetInnerHTML`; `payAssistAdmin` מסיר CR/LF ומוגבל באורך; HTML escaped |
| מצב דמה בפרודקשן | **תוקן** – `simulateAllowed()` דורש גם לא-Vercel; כפתור הסימולציה מוצג רק כשהשרת מחזיר `simulate:true` |
| DB: פרמטרים, אינדקסים, ON DELETE | **תקין** – drizzle בלבד; `sql.raw` רק ב-DDL קבוע; cascade/set null הגיוניים |
| headers/cookies: אין סוד ב-URL ל-Referer; no-store | **תקין** – `Cache-Control: no-store` ל-/pay, /api/pay/*, /admin/payments; הקישור לנדרים נושא טלפון/מייל (לא סוד) ונמחק משורת הכתובת ע"י `HideParameters` |
| דליפת מפתח: לוגים, DB (error/callback/raw), יומן, מסך, מייל, agent events | **תוקן** – `redactNedarim` בכל כתיבה; `agentEvents.redactSecrets` כולל `npk_` + env NEDARIM_* + SESSION_SECRET; fetch עם `redirect:"error"`; המפתח רק ב-POST body |

## מה חסר / שאלות פתוחות למשה

1. **SQL ב-Neon לפני ה-push** (`npx tsx scripts/create-nedarim-tables.ts --apply`) – push מפרס מיד.
2. `NEDARIM_MOSAD_ID=7019454` ו-`NEDARIM_SECRETS_KEY` ב-Vercel (×3) + Redeploy; את מפתח ה-API להזין במסך הניהול (או env).
3. שמות שדות `GetHistoryJson` ופורמט `TransactionTime` – לאמת אחרי הקריאה הראשונה (`raw` במטמון).
4. **תשלומים (Tashlumim):** `Payment=1` נעול. אם רוצים לאפשר פריסה – להסיר את `PaymentLock` (ההיסטוריה מראה את הסכום המלא בשורה אחת).
5. הפעלה תקופתית (cron) – לא נוספה (ל-Hobby אין cron חופשי); הזיהוי קורה כשמורה בדף ההמתנה / מנהלת לוחצת "רענון". מורה שסגרה
   את הדף – התשלום יזוהה בפעם הבאה שמישהי/המנהלת מפעילה רענון (או CallBack אם יוגדר).
6. שדרוג ממלאת מקום→שנתי, רכישה בודדת/תיקייה – עדיין בקופה המדומה.
