# תשלום והפעלת מנוי דרך נדרים פלוס (`/pay`)

מורה מחוברת בוחרת מסלול (מנוי שנתי / ממלאת מקום 3 חודשים / ממלאת מקום יומית) ואת המקצועות, **מופנית לדף התשלום המתארח של
נדרים פלוס** (`https://www.matara.pro/nedarimplus/online/?mosad=<קוד המוסד>`) עם הסכום נעול ופרטייה ממולאים – והאתר מזהה את
התשלום בהיסטוריית העסקאות של המוסד (API של נדרים) ופותח לה **בדיוק את אותו מנוי שהקופה הישנה הייתה יוצרת** (שורות `purchases`,
תוקף מההורדה הראשונה, מכסות, קופון, מייל אישור). האתר לא מחייב ולא מקבל פרטי כרטיס בשום שלב. ענף `feature/nedarim-payments`.

**מצב (22.10.2026, סוף הלילה):** הקוד **פרוס לפרודקשן וכבוי** (`nedarim_enabled` לא נדלק – ההדלקה ב-/admin/settings על ידי
מנהלת). 5 הטבלאות קיימות ב-Neon; משתני הסביבה `NEDARIM_MOSAD_ID`, `NEDARIM_SECRETS_KEY`, `NEDARIM_API_PASSWORD` (Production+Preview)
ו-`NEDARIM_CALLBACK_SECRET` (×3) מוגדרים ב-Vercel. נבדק **בפועל** מול נדרים (קריאות לקריאה בלבד + 2 תשלומי בדיקה של המנהלת:
10 ₪ מקישור רגיל, 1 ₪ מקישור עם פרמטרים) – ר' "יומן בדיקות אמיתיות". **עדיין לא נבדקה זרימה מלאה מהאתר** (תשלום → התאמה
אוטומטית → מנוי) כי ההגדרה כבויה. ר' "מה חסר".

> תיקון תיעוד: גרסאות קודמות של המסמך (ושל השיחה) טענו שאין ב-API של נדרים פעולה ליצירת קטגוריות. זה **שגוי** – בגרסה המלאה של
> התיעוד שלהם יש `GetNewGroupe` / `SaveEditGroupe` / `DeleteEditGroupe` (ר' "קטגוריות"). הטעות נבעה מקריאה חלקית של המסמך.

## רכישת פריט בודד דרך נדרים – הורדה בודדת / קובץ מורחב (נוסף 22.10.2026, **לא פרוס, לא נבדק מול נדרים**)

בנוסף למסלולי המנוי, `/pay` מוכר גם **פריטים**: `?material=ID` = הורדה בודדת (plan `single`, מחיר = `materials.price`) ו-`?bundle=ID` =
קובץ מורחב – תיקייה שלמה (plan `bundle`, מחיר = `bundleAmountFor` ב-`purchase-helpers.ts`: מחיר ידני / 15 ₪ ליחידה / 70% מסכום
החומרים – בדיוק כמו הקופה הישנה). אותה זרימה בדיוק: `POST /api/pay/intent` → `NP-…` → הדף המתארח (סכום נעול, `Analytic` =
המזהה) → polling → `sync.ts` (אותו שער 20/שעה) → `matchPendingPayments` → `settleFromTransaction` → **אותה שורת `purchases` שהקופה
הישנה (`purchaseAction`) יצרה**: `single` = `{plan:"single", materialId, categoryId: התיקייה של החומר, amount, downloadsLimit:null,
endsAt:null}`, `bundle` = `{plan:"bundle", categoryId, amount, downloadsLimit:null, endsAt:null}` (`itemPurchaseRow` ב-`logic.ts`,
נקרא מ-`buildPurchaseRows`). אישור ידני / "תקן מנוי" / סימולציה עובדים לפריטים דרך אותו `settle`.

- **מסך המעבר:** `/checkout?material=ID` ו-`/checkout?bundle=ID` מפנים ל-`/pay?material=` / `/pay?bundle=` כשההגדרה דולקת (במקום
  הודעת "עוד לא זמינה"); כבויה → הקופה המדומה כמו קודם. `/pay` כבוי → חזרה ל-`/checkout`. קישורי ההורדה (`/api/download/[id]`
  → `/checkout?material=`, `download-folder` → `/checkout?bundle=`, כרטיסי החומר, באנר התיקייה) לא שונו.
- **DB (`nedarim_payments`):** `plan` הוא ה-enum `plan` שכבר מכיל `single`/`bundle` (אומת ב-Neon, קריאה בלבד – אין צורך ב-DDL ל-enum).
  נוספו 3 עמודות **nullable**: `material_id` (REFERENCES materials, SET NULL), `item_category_id` (REFERENCES categories, SET NULL;
  ב-single = התיקייה של החומר, כמו `purchases.category_id`), `item_title varchar(200)` (שם הפריט בזמן הבקשה – למייל/לאדמין/ל-avour).
  **DDL: `npx tsx scripts/add-nedarim-item-columns.ts` (dry-run) → `--apply` – חייב לרוץ ב-Neon לפני ה-push** (drizzle בוחר את כל
  העמודות; בלעדיהן כל SELECT מ-`nedarim_payments` ייכשל, כולל למסלולי המנוי). אותן פקודות גם ב-`create-nedarim-tables.ts`. שורות
  ישנות (מנויים) נשארות עם NULL והקוד מתייחס אליהן כמסלול.
- **כללים (כמו `purchaseAction` הישן + "כבר שלך"):** חומר חייב להיות `active`, השרשרת שלו לא מושהית, לא `free`, מחיר > 0; תיקייה
  `active`, שרשרת לא מושהית, יש בה חומרים והמחיר > 0 (`loadPayableItem` ב-`src/lib/nedarim/items.ts`). **חסימת תשלום כפול**
  (`itemAlreadyCovered` ב-`logic.ts`, על הרכישות הפעילות של `getActivePurchases`): `owned` – אותו חומר/אותה תיקייה כבר נרכשו;
  `bundle` – תיקיית-אב נרכשה כקובץ מורחב; `subscription` – מנוי פעיל שמכסה (מקצוע בשרשרת או מנוי לכל המקצועות, לא "ממתין לבחירה",
  מכסה לא נגמרה). לתיקייה – ממלאת מקום יומית (סל 20 הורדות) **לא** חוסמת. נבדק גם בדף (`/pay` מציג "הפריט הזה כבר שלך" עם קישור לפרק)
  וגם ב-`/api/pay/intent` (409, `purchase.denied` עם `item_owned`/`item_bundle`/`item_subscription`). סכום תמיד מהשרת.
- **קופון** (`getBestPercentCoupon`): אותה נוסחה כמו למסלולים – `round(list × (100−pct)/100)`; N2 (בקשה פתוחה עם אותו קופון)
  משווה גם `materialId`/`itemCategoryId` (`sameIntentParams`). פרופיל חסר (טלפון/עיר/תיכון) – אותו קוד.
- **נדרים:** `groupe` = "הורדה בודדת" / "קובץ מורחב" (`ITEM_GROUPE_NAMES`, `GROUPE_NAMES`, `groupeNameFor`); `avour` =
  `"לו״ז העניין - הורדה בודדת - <שם החומר>"` (שם חומר/תיקייה = תוכן ציבורי, לא PII; ≤100 תווים). כרטיס "קטגוריות בנדרים פלוס"
  מציג גם את שתי קטגוריות הפריטים ("לפי הפריט" / "בלי מינימום"), ו"סנכרן סכומים" **יוצר אותן אם חסרות – בלי `Amount`** (מחיר משתנה;
  מינימום היה חוסם פריטים זולים); אם קיימות – לא נוגע בהן (`planSyncRows` עם `priceAgorot: null`). **הן עדיין לא נוצרו במוסד** –
  ללחוץ "סנכרן סכומים" (או ליצור ידנית בשמות המדויקים) לפני ההפעלה; בלי קטגוריה `groupe` עדיין נרשם בעסקה כטקסט (אומת 22.10 – "נכנס
  לשדה Groupe גם בלי שהוגדר בפורטל"), רק לא יופיע כקטגוריה בדוחות.
- **אחרי "שולם":** `GET /api/pay/status` / `POST /api/pay/check` מחזירים `kind` (`plan`/`single`/`bundle`), `label`, סכומים ו-`successHref`
  (`successHrefFor`): חומר → דף הפרק (`chainToHref`), תיקייה → דף התיקייה עם `?dlall=1` (הורדת כל הקבצים, כמו ה-redirect של הקופה
  הישנה), מנוי → `/account`. דף הסיום: "הקובץ שלך מוכן להורדה!" / "התיקייה שלך מוכנה להורדה!" + כפתור. `customerStatusText` מקבל
  `kind`. מייל `templates.purchase` עם `describeIntent` ("הורדה בודדת – <שם>" / "קובץ מורחב – תיקייה «<שם>»"); תנועה כספית
  `method="nedarim"`; אודיט `purchase.nedarim` עם `materialId`/`itemCategoryId`.
- **UI:** `/pay?material=` / `?bundle=` – בלי שלב מסלול ובלי מקצועות: כרטיס הפריט (פירורי לחם, שם, סוג/מספר חומרים, מחיר, "חזרה
  לפרק/לתיקייה", הטבעת סימן המים) → פרטים חסרים → סיכום → נדרים. הטקסט "אין צורך להעתיק או להקליד שום פרט" נשאר. אדמין: עמודת
  "מסלול" מציגה את שם הפריט + `#id`.
- **בדיקות:** `scripts/nedarim-tests/items.test.ts` (7 בדיקות: מפתחות/שמות קטגוריה, קישור מתארח לפריט, avour בלי PII, שורת purchases,
  N2 לפריט, כיסוי כפול על כל המקרים, טקסטים) + הרחבת `groupe.test.ts`. **לא אומת:** זרימה מלאה מול נדרים (תשלום אמיתי על פריט),
  התנהגות הדף המתארח עם `groupe` שעוד לא קיים במוסד, דף ההמתנה/הסיום בדפדפן (אין DB בדיקה – `.env.local` = פרודקשן, לא הורצה
  סימולציה), ו-`?dlall=1` אחרי החזרה. **שדרוג ממלאת מקום→שנתי** (`upgrade.ts`) עדיין בקופה המדומה (חסום כשההגדרה דולקת).

## תנאי תשלום: תשלום אחד / תשלומים / הוראת קבע (נוסף 28.10.2026, **לא פרוס, לא נבדק מול נדרים**)

**מקור:** מסמך ה-API המלא של נדרים (`NedarimPlus-API.md`, ~190KB; עותק מקומי ב-`_nedarim-api/` – מתעלם ב-git; המקור: https://reports.matara.pro/more/api , ועותק ציבורי בריפו `seedlinggary/kty-frontend`). נקרא כולו בחלקים הרלוונטיים: "דף תשלום – קישור ישיר", אייפרם (עסקה בצד שרת), היסטוריית עסקאות, Callback/Webhook, כל פעולות ה-Keva (`GetKevaId`/`GetKevaJson`/`UpdateKevaNew`/`DisableKeva`/`DeleteKeva`), קטגוריות.

| מסלול | תשלום רגיל (ברירת מחדל) | הוראת קבע (אופציונלי, בלי תפיסת מסגרת) |
|---|---|---|
| מנוי שנתי | **12 תשלומים** (`Payment=12`; 588 → 12×49; הסכום כולו נתפס במסגרת הכרטיס) | 12 חיובים חודשיים (12×49) – בלי תפיסת מסגרת |
| ממלאת מקום 3 חודשים | **3 תשלומים** (390 → 3×130) | 3 חיובים חודשיים (3×130) |
| ממלאת מקום יומית, הורדה בודדת, קובץ מורחב | תשלום אחד | — |

- **הלוגיקה:** `PAYMENT_TERMS` / `chargeTermsFor(plan, mode, total)` ב-[logic.ts](../src/lib/nedarim/logic.ts). הו"ק מוצעת רק כשהסכום (אחרי קופון) **מתחלק בשווה באגורות** וכל חיוב ≥ 5 ₪ (אין עיגול – הסכום נעול). `POST /api/pay/intent` מקבל `payMode: "normal"|"keva"` (ברירת מחדל normal); keva דורש את ההגדרה **`nedarim_keva_enabled`** (/admin/settings, כבויה כברירת מחדל). התנאים נשמרים על הבקשה: `charge_mode`, `installments`, `charge_amount` (הסכום הצפוי ב-`Amount` של העסקה), `keva_id`.
- **נעילה בנדרים (הדף המתארח):** `AmountLock=1`, `PaymentLock=1`, `Payment=<N>`, ו-`OnlyNormal=1` / `OnlyKeva=1` (בהו"ק `Amount` = החיוב **החודשי**, `Payment` = מספר החודשים – לפי "דף תשלום – קישור ישיר", דוגמת "100 בחודש למשך 12 חודשים, הכל נעול"). **הנעילה בקישור היא בצד הדפדפן** – אפשר לערוך את הכתובת – ולכן נדרים הם לא "ההגנה"; ההגנה היא האימות בצד שלנו (למטה). נעילה אמיתית בצד שרת קיימת רק בזרימת האייפרם (`CreateTransaction`, `ApiValid`) – החלטה אדריכלית נפרדת (עכשיו: דף מתארח בלבד, אין iframe).
- **קטגוריה (`groupe`) להו"ק:** `"<שם המסלול> – הוראת קבע"` (למשל "מנוי שנתי – הוראת קבע") – **בכוונה לא** אותו שם כמו הקטגוריה הרגילה: ל-`Amount` של קטגוריה בנדרים תפקיד של *מינימום תרומה* (588), וחיוב חודשי של ₪49 היה נחסם מולו. השם לא קיים ברשימת הקטגוריות (טקסט חופשי, אומת שנכנס ל-`Groupe`).
- **מה נדרים מחזירים (`GetHistoryJson`):** עסקת תשלומים = **שורה אחת**, `Amount` = הסכום המלא, `Tashloumim` = N (בעסקה רגילה "1" – אומת על העסקאות האמיתיות, `TransactionType` "רגיל"). חיוב הו"ק = שורה לכל חיוב, `Amount` = הסכום החודשי, `KevaId` מלא, `TransactionType` הוראת קבע. ה-`raw` השמור כולל עכשיו גם `KevaId` / `FirstTashloum` / `NextTashloum`.
- **האימות בצד האתר** (`checkTxTerms`, `findCandidates`, `decideAutoMatches`, `settleFromTransaction`, `checkManualTransaction`):
  1. **סכום:** חייב להיות `charge_amount` בדיוק (כמו קודם).
  2. **תשלומים:** `Tashloumim` חייב להיות מספר התשלומים שנקבע (שנתי 12; 3 חודשים 3 – החלטת הבעלים 28.10.2026: שנתי הוא 12 תשלומים ולא תשלום אחד). חסר/לא ידוע → מתקבל רק כשצפוי תשלום אחד (יומית/פריט).
  3. **סוג:** תשלום רגיל לא יכול להיות הו"ק (`KevaId` / "הוראת קבע" בסוג העסקה) ולהיפך.
  4. **חדש:** עסקה **שנושאת את מזהה הבקשה** (`NP-…`) אבל לא בתנאים (סכום אחר, תשלום אחד במקום 12, תשלום אחד במקום 3, הו"ק במקום רגיל…) כבר לא נעלמת בשקט – הבקשה עוברת ל"ממתין לאישור ידני" עם הסיבה ומספר העסקה (`review`). אין שדרוג אוטומטי; אישור ידני חריג אפשרי (`force`) ונרשם באודיט.
  5. **הו"ק – גם ההוראה עצמה:** לפני פתיחת מנוי על החיוב הראשון נקראת `GetKevaId` (`getKevaDetails` ב-manage.ts; קריאה בודדת, בתיעוד אין לה מגבלת 20/שעה) ו-`checkKevaRecord` בודק: `KevaStatus=1` (פעילה), `KevaFrequency=1` (חודשית), שקל, `KevaAmount` = החיוב החודשי, ו-`KevaTashlumim` (יתרה) + `KevaSuccess` (בוצעו) = מספר החיובים שנקבע – הוראה "ללא הגבלה"/סכום אחר → אישור ידני. שגיאת רשת/תשובה לא ברורה → לא פותחים, מנסים שוב בסבב הבא.
- **מדיניות הו"ק (להחלטת הבעלים):** המנוי נפתח **עם החיוב הראשון** (כל התקופה). חיוב מאוחר שנכשל (`GetKevaJson` → `Enabled`/`ErrorText`) **לא** מבטל כרגע את המנוי אוטומטית ואין מסך מעקב – ר' "מה חסר".
- **DDL:** `npx tsx scripts/add-nedarim-terms-columns.ts` (dry-run) → `--apply` – **חייב לרוץ ב-Neon לפני ה-push** (הוספה בלבד, עם ברירות מחדל; גם ב-`create-nedarim-tables.ts`). בלעדיו כל SELECT מ-`nedarim_payments` ייכשל. `.env.local` מצביע לפרודקשן – לא הורצה.
- **בדיקות:** `scripts/nedarim-tests/terms.test.ts` (15 בדיקות: תנאים לפי מסלול, קישור לתשלומים/הו"ק, פענוח `Tashloumim`/`KevaId`, סטיות סכום/תשלומים/סוג → review, אישור ידני, `checkKevaRecord`). **לא אומת מול נדרים:** איך חיוב הו"ק מופיע בפועל ב-`GetHistoryJson` (האם `Analytic` מגיע ל-`Comments` של כל חיוב, מה `Tashloumim` בשורה), מה ערכי `KevaTashlumim`/`KevaSuccess` מיד אחרי החיוב הראשון, ואיך הדף המתארח מתנהג עם `OnlyKeva`+`Payment` נעולים. **לפני שמדליקים `nedarim_keva_enabled`: תשלום בדיקה אחד אמיתי של הו"ק וקריאת ה-`raw` + `GetKevaId`** (אם הסכום ביחד לא יוצא `installments` – `checkKevaRecord` ידחה לאישור ידני, וזה הכיוון הבטוח).

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
       |  2. לשונית חדשה: דף התשלום של נדרים (Amount נעול, Analytic = מזהה הבקשה → Comments, groupe = מסלול; המשלמת מזינה שם/טלפון/מייל בעצמה,
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
- **strong** – מזהה הבקשה `NP-…` מופיע בהערת העסקה (`Comments`; נשלח ב-`Analytic`, שנדרים מכניסים לתחילת ההערה). **בדיוק אחת, שלא
  מתאימה לבקשה אחרת → מנוי.** יותר → אישור ידני.
- **weak** – טלפון מנורמל זהה (ספרות בלבד, 972→0, בלי מקפים) **או** מייל זהה (lowercase), בלי מזהה בהערה (למשל פתחה את דף נדרים
  בלי הקישור שלנו – ובפועל `Comments` ריק כשנכנסים מהקישור הרגיל של המוסד). **החלטת הבעלים (22.10.2026): משדרג אוטומטית, אבל רק
  בייחודיות מלאה** (`decideAutoMatches`): (1) כל תנאי הבסיס – מאושרת, ש"ח, חיובית, אחרי cutoff ואחרי createdAt−15 דק', סכום זהה
  באגורות, לא משויכת; (2) טלפון או מייל שווים; (3) **בדיוק מועמדת אחת לבקשה** (strong+weak, בלי עסקאות שכבר נתפסו) **ובדיוק
  בקשה פתוחה אחת שהעסקה יכולה להתאים לה** בכל סוג התאמה; (4) מכאן גם: אין strong חלופי שמצביע לבקשה אחרת; (5) תפיסה
  אטומית כמו strong (עסקה → בקשה, אינדקס ייחודי חלקי). כל ספק (שתי עסקאות לבקשה, או עסקה שמתאימה לשתי בקשות) → "ממתין
  לאישור ידני" עם מספרי העסקאות. **הנימוק:** המשלמת משלמת בעצמה סכום מדויק; הסיכון היחיד הוא שתשלום של מישהי אחרת באותו
  סכום + אותו טלפון/מייל ייתפס – ולכן דרישת הייחודיות. מנוי שנפתח כך מסומן `verify_method=api_weak` ("זוהה לפי טלפון/מייל"
  באדמין), ובאודיט/ביומן `matchKind: weak_auto`. התאמת שם (ClientName) לא נדרשת – כתיב חופשי בעברית אינו אמין.
- כל ספק → הבקשה `processing` ("ממתין לאישור ידני") עם הסיבה ומספרי העסקאות. סכום שונה/חלקי, מטבע אחר, זיכוי (שלילי), ביטול (0),
  עסקה בלי אישור – לעולם לא מתאימים (גם לא ידנית בלי אישור חריג מפורש). בקשה שביקשה עזרה (assist) יוצאת מההתאמה האוטומטית.
- **אישור ידני עם מספר עסקה** (M1): אם העסקה במטמון – חייבת להיות מאושרת, בסכום זהה, חיובית, בש"ח; אחרת סירוב. "אשר כחריג
  בכל זאת" = אישור מפורש נוסף, נרשם באודיט (`nedarim.manual_settle_override`) עם הסכומים וביומן הבקשה. מספר עסקה שאינו
  במטמון = אישור על אחריות המנהלת (`manual_unverified`).
- **סדר ההשלמה** (M2/M5, `settlementPlan`): תפיסת הבקשה → תפיסת הקופון (נכשל → חזרה ל-processing "הקופון כבר נוצל", בלי
  מנוי) → אם כבר קיימות שורות purchases לבקשה (purchase_id או payment_ref) – לא מכניסים שוב → insert → **מכאן כל כישלון
  (תנועה כספית, מייל) משאיר paid + אירוע error**. בקשה חדשה עם קופון שכבר יש לו בקשה פתוחה של אותה משתמשת – משתמשים בקיימת.
  עסקה שנתפסה ל-settle שלא הושלם ע"י אותה קריאה (כולל "כבר טופל") משוחררת (L1) – ובאישור ידני רק אם הקריאה הזו תפסה אותה (N6).
- **קופון עם הזמנה שונה** (N2): בקשה פתוחה עם אותו קופון אבל מסלול/מקצועות/דלג/סכום אחרים → הישנה מבוטלת (`replaced` +
  `replaced_by` עם המזהה החדש) ונוצרת חדשה; עסקה שתשולם על הישנה נשארת לא-משויכת וגלויה למנהלת. הזמנה זהה → אותה בקשה.
- **paid בלי מנוי** (N7): כשל אחרי התפיסה בעבר → שורה "שולם בלי מנוי" באדמין (צ'יפ + אזהרה) וכפתור "תקן מנוי"
  (`ensurePurchasesForPaid`, אידמפוטנטי – קודם מחפש לפי payment_ref).
- **Confirmation** (N3): `0`/`00`/`false`/`null`/`undefined`/`N/A`/`none`/`-`/רווחים = אין אישור.
- **CallBack** (N8): מזהה עסקה ששייך כבר לבקשה paid אחרת לא נכתב על הבקשה (אירוע `callback_conflict` בלבד).
- **processing מעל 48 שעות** (N10): למורה "ממתינה לטיפול המנהלת כבר יותר מיומיים… כתבי לנו"; באדמין צ'יפ "מעל 48 שעות" ואזהרה בשורה.

### סנכרון ההיסטוריה (sync.ts) – זמינות ועמידות (N1/N5)

- **500 שורות לקריאה** (`MAX_ROWS`), insert ב-**batch של 150** עם `onConflictDoNothing`; `last_transaction_id` מתעדכן **אחרי כל chunk**
  שנשמר – גם אם ה-route (60 שנ') ייהרג באמצע, הסבב הבא ממשיך מהנקודה שהושגה. אין לולאה בלי התקדמות.
- chunk שנכשל → שמירה שורה-שורה עד השורה הבעייתית; `last_transaction_id` **לעולם לא מתקדם מעבר לשורה שנכשלה** (`advanceLastId`),
  הסבב נעצר עם `lastError`, והבא ממשיך משם. שורות בלי מזהה/סכום (לא ניתנות לפענוח) לא נשמרות אבל כן מקדמות את המצב.
  כל הערכים נחתכים לאורכי העמודות (`clampTx`: email 255, phone 30, currency 4, name 120, confirmation 40, status 30…).
- **נקודת התחלה ידנית** (מסך הניהול → "קביעת נקודת התחלה"): לפני ההדלקה הראשונה המנהלת מזינה את מספר העסקה האחרון מפורטל
  נדרים – הקריאה הבאה מתחילה אחריו ולא סורקת שנים של היסטוריה (ל-API אין "תן לי רק את הסוף": בלי LastId הוא מתחיל מהעסקה
  הראשונה של המוסד). מותר רק להעלות; הורדה דורשת סימון "לאפשר הורדה" (קריאה חוזרת). עסקאות היסטוריות ממילא לא מתאימות
  (`cutoff_at`), אז דילוג על ההיסטוריה בטוח. **מומלץ לקבוע נקודת התחלה לפני "בדיקת מפתח" הראשונה.**
- עסקאות במטמון **בלי מועד מפוענח** נספרות ומוצגות באדמין (N4) – סימן לפורמט `TransactionTime` לא מוכר (לבדוק `raw`).
  פענוח תאריכים: טווחים + round-trip (31/02 → null), `dd/MM` לא תקף **לא** מנוחש כ-`MM/dd` (→ null), עתידי מעבר ליום → null,
  `/Date(ms[+zzzz])/` של ASP.NET נתמך.

### פרמטרי דף התשלום המתארח – מה נבדק **בפועל** (22.10.2026, מוסד 7019454)

נבדק עם קישור אמיתי שהכיל `comment`, `Analytic`, `groupe`, `avour`, `ClientName`, `Phone`, `Email`, `Amount=1&AmountLock=1`, ואז נקראה
העסקה ב-`GetHistoryJson`:

| פרמטר בקישור | מה קרה בעסקה שנרשמה | שימוש שלנו |
|---|---|---|
| `Amount` + `AmountLock=1` | נשמר (`Amount` `"1"`) | הסכום המדויק, נעול |
| **`Analytic`** | נכנס **לתחילת `Comments`** | **הזיהוי המהימן** – `Analytic=<NP-…>` תמיד |
| `avour` | נכנס ל-`Comments` **אחרי** ה-Analytic, מופרד ב-`" | "` (תוצאה: `"<Analytic> | <avour>"`) | תיאור קצר בלי PII ("לו״ז העניין - מנוי שנתי") |
| `groupe` | נכנס לשדה `Groupe` כפי שהוא | מפתח המסלול (`yearly`/…) – לדוחות בלבד, לא לזיהוי |
| `comment` | **לא נכנס לשום שדה** | **לא נשלח** |
| `ClientName` / `Phone` / `Email` | **לא נשמרו** – נשמרים רק הפרטים שהמשלמת (או הכרטיס שלה) הזינה בטופס | נשלחים כנוחות, שום דבר לא נשען עליהם; המורה מתבקשת בדף ההמתנה להזין את אותו טלפון/מייל כמו באתר |
| `Payment=1`/`PaymentLock=1`, `OnlyNormal=1`, `OnlyShekel=1`, `Redirect`, `HideParameters=1` | לפי קוד הדף (`JavaScript5.js`) | כמו קודם |

**אין** פרמטר CallBack ואין Param1/Param2 בדף. פרמטרים נוספים שקיימים בקוד הדף ולא בשימוש: `Street`/`City`/`Zeout`, `Day`,
`Bank`/`Snif`/`Account`, `groupelock`/`avourlock`, `CustomAvour`/`CustomKoteret`, `TakanonChecked`, `logo`, `currency`, `OnlyDollar`/
`ForceDollar`, `Language`/`lang`, `NormalDefault`/`KevaDefault`, `onlykeva`/`onlymasav`/`OnlyBit`/`OnlyDigitalTransfer`/`OnlyCrypto`,
`CRM`, `S`, `MatrimId`, `device`.

**שדות `GetHistoryJson` שאומתו:** `Shovar`, `Zeout`, `ClientName`, `Adresse`, `MisparIchi`, `Phone`, `Mail`, `Amount` (מחרוזת),
`Currency` (`"1"`), `TransactionTime` (`"22/10/2026 04:37:02"` – `dd/MM/yyyy HH:mm:ss`, שעת ירושלים), `Confirmation` (עם רווח מוביל),
`LastNum`, `TransactionType` (`"רגיל"`), `Groupe`, `Comments`, `Tashloumim`, `TransactionId` ועוד – **ואין שדה סטטוס כלל** (אישור =
`Confirmation` בלבד). `extractReference` מוצא את `NP-XXXXXXXX` בכל מקום ב-`Comments` (גם עם `" | טקסט"` אחריו). fixture
מנוטרל-PII באותו מבנה: `realistic GetHistoryJson row from a site link` ב-`logic.test.ts`.

### קטגוריות (Groupe) בנדרים – ניהול מהאתר

במוסד נוצרו 3 קטגוריות בשמות המסלולים (`PLAN_GROUPE_NAMES`: "מנוי שנתי", "ממלאת מקום 3 חודשים", "ממלאת מקום יומית") והקישור
מעביר את השם ב-`groupe`. כרטיס "קטגוריות בנדרים פלוס" ב-`/admin/payments` (`src/lib/nedarim/groupe-logic.ts` – לוגיקה + לקוח API
עם fetch מוזרק, נבדק ב-`groupe.test.ts`; `groupe.ts` – עטיפת שרת; actions ב-`nedarim-admin.ts`):
- **API** (Manage3.aspx, POST body, אומת בפועל): `GetNewGroupe` → מערך `{id, Name, Amount, PhoneGroupe, TamalType, GoToMosad,
  GoToMosadGroupe, GoToTofes, Goal, Cumule}` (ריק = `[]`); `SaveEditGroupe` – Id ריק = יצירה (`{"Status":"OK","Id":N}`), Id קיים =
  עדכון; **תמיד נשלחים כל השדות** (`buildSaveParams` ממזג את הקטגוריה הקיימת – נדרים שומרים רק מה שנשלח); שם שמתחיל ב-* =
  מוסתרת; שם כפול → `Status:Error`; `DeleteEditGroupe` (מחיקה רכה). שגיאות `Status`/`Result:"Error"` + `Message` → עברית
  (`friendlyGroupeError`: "שם כפול", "אין הרשאה למפתח"…).
- **הכרטיס**: טבלה (שם, סכום מינימלי, יעד, עד כה נתרם), "רענון" (router.refresh – הרשימה נקראת פעם אחת עם טעינת הדף, אין
  polling), הוספה, עריכה inline, מחיקה עם אישור. ולידציה (zod): שם 1–100 תווים בלי תווי בקרה; סכום/יעד ≥0 עם עד 2 ספרות
  (נקודה; פסיק נדחה כדו-משמעי) או ריק. אדמין בלבד, rate-limit 30/10 דק', `logAudit` (`nedarim.groupe_save/delete/sync`).
- **"סנכרן סכומים עם מחירי האתר"** (רק בלחיצה): לכל מסלול – הקטגוריה לפי שם (נוצרת אם חסרה), `Amount` = המחיר הנוכחי של
  המסלול **מאותה פונקציה שבונה את הסכום הנגבה** ב-`/api/pay/intent` (`getPlanPrices().plans[plan]` – מחיר השקה/הגדרות). **אזהרת
  קופון:** `Amount` הוא *מינימום תרומה* בדף של נדרים; קופון פרטי מוריד את הסכום הנגבה (`round(list × (100−pct)/100)`) מתחת למחיר –
  ומינימום גבוה ממנו יחסום את התשלום המוזל. לכן ברירת המחדל: מינימום = המחיר אחרי הנחת הקופון הפעיל הגבוהה ביותר
  (`getMaxActiveCouponPercent`, אותה נוסחת עיגול – `minimumAmountAgorot`); חלופות: אחוז מקסימלי ידני, או המחיר המלא (קופונים
  ייחסמו). הטבלה מציגה לכל מסלול: מחיר באתר, מינימום יעד, מה מוגדר בנדרים, ו"לא מסונכרן" כשנבדלים.
- עם ברירות המחדל בקוד (בלי הגדרות ב-DB) הסכומים: מנוי שנתי ₪588, ממלאת מקום 3 חודשים ₪390 (3×130), ממלאת מקום יומית ₪160;
  עם קופון 10% – 529.2 / 351 / 144. בפועל נקראים מההגדרות (`price_yearly` וכו').
- **הנחות/סיכונים:** `Amount` מינימלי – המשלמת יכולה לשלם *יותר* (ההתאמה דורשת סכום זהה בדיוק, אז תשלום גבוה מהמחיר ילך
  לאישור ידני); הקטגוריה מזוהה לפי שם – שינוי שם בנדרים/ב-`PLAN_GROUPE_NAMES` ינתק אותה (הסנכרון ייצור חדשה); הערכים
  `Cumule`/`PhoneGroupe`/`TamalType`/`GoTo*` לא נערכים מהאתר אבל נשלחים חזרה כפי שהם; קופון שייווצר *אחרי* הסנכרון באחוז גבוה
  יותר דורש סנכרון מחדש (אין אוטומציה – בכוונה).

### GetHistoryJson – מה הונח

`POST https://matara.pro/nedarimplus/Reports/Manage3.aspx` עם `Action=GetHistoryJson, ApiPassword, MosadId, LastId (exclusive),
MaxId (≤2000)`; תשובה: מערך עם `TransactionId, Amount, Currency (1=ש"ח), Phone, Mail, Comments, TransactionTime, ClientName,
Confirmation, LastNum, …`. עסקאות מבוטלות = `Amount` 0; זיכויים = שורות נפרדות בסכום שלילי. **אומת ע"י הבעלים מול ההיסטוריה
האמיתית של המוסד (22.10.2026):** `Phone/Mail/ClientName/Zeout/Adresse` מגיעים כשהמשלמת ממלאת אותם; `Comments` ריק כשנכנסים
מהקישור הרגיל של המוסד (ולכן weak חשוב); `Confirmation` עם רווח מוביל (נחתך ב-`normalizeConfirmation`); **אין שדה סטטוס**
(אישור = Confirmation בלבד); `TransactionTime` בפורמט `dd/MM/yyyy HH:mm:ss`; `Currency` `"1"`; `Amount` כמחרוזת (`"10"`). fixture
מנוטרל-PII בבדיקות (`realistic GetHistoryJson row`). `parseHistoryRow` סובלני לשמות קרובים; תאריך בלי offset מפוענח
כ-**Asia/Jerusalem** (Intl, כולל שעון קיץ, בלי תלות ב-TZ של השרת). אחרי הקריאה הראשונה בפרודקשן כדאי להציץ ב-`raw`
ב-`nedarim_transactions` (נשמרים רק `RAW_KEEP_FIELDS`: מזהה, סכום, מטבע,
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
| `src/lib/nedarim/config.ts`, `hosted.ts` | קונפיגורציה (env + הגדרה + סודות), בניית הקישור לבקשה (groupe/avour לפי `groupeNameFor` / `buildTransactionComment`) |
| `src/lib/nedarim/items.ts`, `scripts/add-nedarim-item-columns.ts`, `scripts/nedarim-tests/items.test.ts` | רכישת פריט (הורדה בודדת / קובץ מורחב): `loadPayableItem` (כללים + מחיר בשרת), `itemCoverageFor` ("כבר שלך"), `successHrefFor`; ה-DDL של 3 העמודות; הבדיקות |
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

1. **יחידה:** `TZ=UTC npx tsx --test scripts/nedarim-tests/*.test.ts` (32 בדיקות: קישור, פענוח היסטוריה, התאמה חזקה/חלשה/ספק/עסקה של
   אחרת/זיכוי/סכום חלקי, אישור `Confirmation`, תאריכים (Asia/Jerusalem), הצפנה/פענוח, tag פגום, AAD, redaction, ניהול קטגוריות עם
   fetch מדומה). typecheck: `npx tsc --noEmit`.
2. **מקומית עם DB בדיקה** (לא Neon של הפרודקשן): `npx tsx scripts/create-nedarim-tables.ts --apply`, `NEDARIM_SIMULATE=1`,
   `npm run dev`, `/pay?plan=yearly` → "המשך לתשלום" → "סימולציית תשלום מוצלח" → `/admin/payments` שורה `שולם (סימולציה)`, מנוי
   ב-`/admin/subscriptions`, תנועה ב-`/admin/finance`.
3. **בפרודקשן (SQL, משתני הסביבה והפריסה כבר בוצעו):** נקודת התחלה (אם יש היסטוריה ארוכה) + "בדיקת מפתח" (קריאה אחת) בכרטיס
   הסנכרון → הזנת מפתח API חדש בכרטיס "מפתח API" (המפתח הנוכחי נחשף בשיחה – להחליף) → "סנכרן סכומים" בכרטיס הקטגוריות →
   הדלקת ההגדרה → **תשלום אמיתי בסכום קטן דרך קופון פרטי** (L7: ליצור
   ב-/admin/coupons קופון אחוזי גבוה למשתמשת בדיקה – כך הסכום מוזל רק לה, בלי לגעת ב-`price_yearly` לכולן) → "שילמתי – בדקי
   עכשיו" → השורה צריכה להגיע ל-`שולם – הותאם לעסקה`. אם נשארה "ממתין לאישור ידני" – לבדוק את `raw` של העסקה במטמון (שמות
   השדות, במיוחד `Confirmation`/`TransactionTime`) ולאשר ידנית עם מספר העסקה.

## אבטחה – מה נבדק (22.10.2026)

| סעיף | מצב |
|---|---|
| callback: השוואת סוד באורך קבוע (hash+timingSafeEqual), rate-limit IP, גודל גוף, תשובה אחידה, לא משלים לבדו, לוג בלי סודות, תמיכה בכותרת | **תקין / תוקן** (SHA-256 compare; `X-Nedarim-Key` מועדף, `?key=` נתמך רק כגיבוי; רצפת רענון 3 דק' כמו למורות – L2). **סיכון פתוח:** `?key=` בשורת הכתובת מופיע בלוגי הגישה של Vercel – להעדיף כותרת אם הפורטל של נדרים מאפשר; וממילא ה-callback לא משדרג |
| סקירה 2 (22.10.2026): H1 עסקה לא-מאושרת, M1 אישור ידני בסכום שונה, M2 קופון, M3 עסקאות היסטוריות/בלי מועד, M4 אזור זמן, M5 purchases כפולים, L1 שחרור עסקה, L3 מונה שעתי, L5 סוד לא-ניתן-לפענוח, L6 פקיעה בסטטוס, M6 raw מצומצם + ניקוי, L4 weak | **תוקן** – ר' "ההתאמה" למעלה; בדיקות יחידה לכל סעיף חובה ב-`logic.test.ts` (H1/M1/M2+M5/M3/M4/L4) |
| סקירה 3 (22.10.2026): N1 זמינות הסנכרון, N2 קופון עם הזמנה שונה, N3 Confirmation "ריק", N4 תאריכים (טווחים/עתיד/ASP.NET/MM-dd), N5 חיתוך לאורכי עמודות + אי-קידום LastId מעבר לכישלון, N6 שחרור עסקה רק אם נתפסה כאן, N7 paid בלי מנוי, N8 CallBack עם עסקה של בקשה אחרת, N10 processing מעל 48 שעות | **תוקן** – ר' "סנכרון ההיסטוריה" ו"ההתאמה"; בדיקות N1–N5, N7, N10 ב-`logic.test.ts` |
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

1. ~~SQL ב-Neon~~ – **בוצע** (22.10.2026, `create-nedarim-tables.ts --apply`, תוספת בלבד). שינוי schema עתידי: להריץ את אותו סקריפט
   לפני ה-push (push מפרס מיד).
2. ~~משתני סביבה~~ – **בוצע** (ר' "מצב"). **מפתח ה-API נחשף בשיחה ובתמלילי הסשן – להחליף במפתח חדש מהפורטל** דרך כרטיס "מפתח API";
   וגם למחוק את טוקן ה-Vercel הזמני שנשלח באותה שיחה (Account Settings → Tokens).
3. ~~שמות שדות `GetHistoryJson` ופורמט `TransactionTime`~~ – **אומתו** מול תשובה אמיתית (ר' "יומן בדיקות אמיתיות").
4. ~~**תשלומים (Tashlumim):** `Payment=1` נעול~~ – **נפתר 28.10.2026** (ר' "תנאי תשלום"): מספר התשלומים נקבע לפי המסלול (שנתי 12, ממלאת מקום 3 חודשים 3), נעול בקישור ונבדק מול `Tashloumim` שחוזר. **פתוח:** מעקב חיובי הו"ק מאוחרים (כישלון חיוב בחודש 2+ → אין ביטול/התראה אוטומטיים; אפשר לבנות מעל `GetKevaJson`/`GetKevaId` + `DisableKeva` ו-webhook "הקמת הוראת קבע" שלא הוגדר).
5. הפעלה תקופתית (cron) – לא נוספה (ל-Hobby אין cron חופשי); הזיהוי קורה כשמורה בדף ההמתנה / מנהלת לוחצת "רענון". מורה שסגרה
   את הדף – התשלום יזוהה בפעם הבאה שמישהי/המנהלת מפעילה רענון (או CallBack אם יוגדר).
6. שדרוג ממלאת מקום→שנתי – עדיין בקופה המדומה (חסום כשההגדרה דולקת). ~~רכישה בודדת/תיקייה~~ – **נבנה (22.10.2026, ר' "רכישת פריט
   בודד" למעלה), לא פרוס:** לפני ה-push להריץ `scripts/add-nedarim-item-columns.ts --apply`; אחרי הפריסה – "סנכרן סכומים" בכרטיס
   הקטגוריות (יוצר "הורדה בודדת" ו"קובץ מורחב" במוסד) ותשלום בדיקה על חומר זול.
7. לבדוק קופון: `Amount` של קטגוריה הוא **מינימום תרומה**; קופון מוריד את הסכום הנגבה מתחת למחיר המסלול ועלול להיחסם בדף של נדרים
   (לא נבדק). הסנכרון בכרטיס הקטגוריות מחשב מינימום אחרי ההנחה הגבוהה ביותר מקופון פעיל – לסנכרן מחדש אחרי יצירת קופון גבוה יותר.
8. `.github/workflows/deploy-vercel.yml` (שינוי ישן שלא נשמר ב-commit) ועותק עבודה זמני `.claude/worktrees/agent-*` – לא קשורים; לנקות.

## יומן בדיקות אמיתיות (22.10.2026, מוסד 7019454)

נבדק ישירות מול הדף המתארח ו-`Manage3.aspx` (POST, קריאה לקריאה בלבד; שני תשלומי בדיקה של המנהלת בלבד):

| נושא | תוצאה |
|---|---|
| `GetHistoryJson` | מערך JSON. שדות: Shovar, Zeout, ClientName, Adresse, MisparIchi, Phone, Mail, Amount (מחרוזת), Currency ("1"=ש"ח), TransactionTime (`dd/MM/yyyy HH:mm:ss`), Confirmation (**עם רווח מוביל**), LastNum, TransactionType ("רגיל"), Groupe, Comments, Tashloumim, TransactionId, ועוד. **אין שדה סטטוס.** |
| `Analytic` בקישור | נכנס לתחילת `Comments` |
| `avour` בקישור | נכנס ל-`Comments` אחרי ה-Analytic, מופרד ב-` \| ` |
| `groupe` בקישור | נכנס לשדה `Groupe` כמו שהוא (גם בלי שהוגדר בפורטל) |
| `comment` בקישור | **לא נכנס לשום שדה** – הוסר מהקוד |
| `ClientName`/`Phone`/`Email` בקישור | **לא נשמרים**; נכנסים מה שהמשלמת מזינה/הכרטיס שלה. לכן ההתאמה לפי טלפון/מייל היא רשת ביטחון בלבד |
| `Amount` + `AmountLock` | הסכום נשמר ונעול |
| `Redirect` | לפי התיעוד: אחרי תשלום מוצלח ~2 שנ' ואז הפניה. בדיקה בלי חיוב: להקליד "בדיקת הפניה" בשדה השם |
| `GetNewGroupe` | `[]` לפני שנוצרו קטגוריות; אחרי היצירה – שלוש הקטגוריות (249079/249080/249081) |
| `SaveEditGroupe` | יצירה עם `Id` ריק החזירה `{"Status":"OK","Id":N}`; המפתח הנוכחי מורשה |
| קטגוריות בדף התשלום של נדרים | **מופיעות** (אומת ע"י המנהלת) |

### קטגוריות (Groupe) – התיעוד המלא של נדרים
`GetNewGroupe` (רשימה), `SaveEditGroupe` (`Id` ריק=יצירה; חובה לשלוח Id, Name, Amount, Goal, Cumule; שם שמתחיל ב-`*` = מוסתרת;
שם כפול נדחה), `DeleteEditGroupe` (מחיקה רכה). אין אורך מקסימלי מתועד לשדות. `UpdateRagil` מעדכן קטגוריה/הערות על עסקה קיימת
(דורש מפתח עם הרשאת "עדכון פרטי עסקה"). הקטגוריות שנוצרו: "מנוי שנתי", "ממלאת מקום 3 חודשים", "ממלאת מקום יומית".
**כשמסתמכים על מסמך ה-API של נדרים – לקרוא אותו כולו (≈133 אלף תווים); קריאה חלקית הובילה לטענה שגויה.**

## יומן עבודה – לילה 22.10.2026 (שינויים באתר ותשתיות)

1. תיקון PDF: `src/lib/docx-blank-lines.ts` + חיבור ב-`driveBridgeCore.ts` (הסרת יישור לשני הצדדים מפסקאות עם קווי מילוי ≥8, בזמן
   ההמרה בלבד; לפני מפתח מטמון ה-PDF). ר' CLAUDE.md.
2. תיקוני מורות: `getFixesForViewer` ב-`src/lib/fixes.ts` מציג למבקשת גם בקשות `pending` שלה (מספר זמני) – הסוכן מחליט אחר כך.
3. תשלום נדרים: כל המסמך הזה. 3 סבבי סקירת אבטחה עצמאית (נסגרו H1, M1–M6, L1–L7, N1–N8, N10; פתוח: זיכוי אחרי "שולם" לא מבטל
   מנוי אוטומטית; `?key=` ב-callback נשאר כגיבוי).
4. ניהול קטגוריות נדרים מהאתר + סנכרון סכומים (`groupe-logic.ts`, `groupe.ts`, כרטיס ב-`/admin/payments`).
5. טעות שתוקנה בדרך: ההתחלה נבנתה בטעות באתר השמלות (`gemach-app`, ענף מקומי `feature/nedarim-payments` שם, לא נדחף ולא פרוס) –
   האתר הנכון הוא אתר הבגרויות.
