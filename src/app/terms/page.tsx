import type { Metadata } from "next";
import {
  ShieldCheck,
  Fingerprint,
  Copyright,
  FileText,
  KeyRound,
  Stamp,
  Ban,
  CreditCard,
  MessagesSquare,
  Mail,
} from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { LegalPage, LegalLink } from "@/components/legal-page";

export const metadata: Metadata = { title: "תנאי שימוש וזכויות יוצרים" };

const ic = "h-6 w-6";

export default function TermsPage() {
  return (
    <LegalPage
      title="תנאי שימוש וזכויות יוצרים"
      intro="הכללים הפשוטים שמאפשרים לנו להמשיך להציע חומרים טובים במחירים נוחים."
      updated="אוגוסט 2026"
      other={{ href: "/privacy", label: "מדיניות פרטיות" }}
      highlights={[
        { icon: <Fingerprint className={ic} strokeWidth={1.5} aria-hidden />, text: "מספר אישי בכל קובץ" },
        { icon: <ShieldCheck className={ic} strokeWidth={1.5} aria-hidden />, text: "העברה הלאה – חשיפה לתביעה" },
        { icon: <Copyright className={ic} strokeWidth={1.5} aria-hidden />, text: "כל הזכויות שמורות" },
      ]}
      sections={[
        {
          icon: <FileText className={ic} strokeWidth={1.5} aria-hidden />,
          title: "כללי",
          body: (
            <p>
              אתר {SITE_NAME} מציע למורות במחוז החרדי חומרי הוראה מוכנים: דפי שכפול, מערכי שיעור,
              מצגות, שאלות מבגרויות קודמות, טיפים ורעיונות. השימוש באתר ובחומרים מהווה הסכמה
              לתנאים אלה.
            </p>
          ),
        },
        {
          icon: <KeyRound className={ic} strokeWidth={1.5} aria-hidden />,
          title: "רישיון שימוש אישי",
          body: (
            <p>
              כל רכישה או הורדה מעניקה למורה רישיון אישי, לא בלעדי ולא ניתן להעברה, להשתמש בחומר
              לצורכי הוראה בכיתותיה בלבד. מותר לשכפל את דפי העבודה לתלמידותיה. אסור למכור, לשתף,
              לפרסם, להעלות לקבוצות או לאתרים אחרים, או להעביר את הקבצים לכל אדם אחר.
            </p>
          ),
        },
        {
          icon: <Fingerprint className={ic} strokeWidth={1.5} aria-hidden />,
          title: "הטבעת מספר אישי",
          body: (
            <p>
              <strong>כל קובץ שמורד מהאתר מוטבע במספר האישי של המורידה</strong> ובהודעת זכויות
              יוצרים. ההטבעה מאפשרת לזהות את מקור הקובץ במקרה של הפצה בלתי מורשית.
            </p>
          ),
        },
        {
          icon: <Ban className={ic} strokeWidth={1.5} aria-hidden />,
          title: "הפצה בלתי מורשית",
          body: (
            <p>
              <strong>העברת קובץ הלאה, במלואו או בחלקו, חושפת את המעבירה לתביעה</strong> אזרחית
              בגין הפרת זכויות יוצרים ולסגירת החשבון ללא החזר כספי. אנו רואות בכך פגיעה ישירה
              ביוצרות החומרים ובאפשרות להמשיך ולהציע אותם במחירים נמוכים.
            </p>
          ),
        },
        {
          icon: <Stamp className={ic} strokeWidth={1.5} aria-hidden />,
          title: "זכויות יוצרים",
          body: (
            <p>
              <strong>כל הזכויות שמורות</strong> ל{SITE_NAME} וליוצרות החומרים. כל החומרים,
              העיצובים, הטקסטים והמצגות מוגנים בזכויות יוצרים. אין להעתיק, לשנות או ליצור יצירות
              נגזרות ללא אישור בכתב.
            </p>
          ),
        },
        {
          icon: <CreditCard className={ic} strokeWidth={1.5} aria-hidden />,
          title: "מנויים, מכסות והחזרים",
          body: (
            <>
              <p>
                מנוי מקנה מספר הורדות מוגדר לתקופה. הורדות שלא נוצלו אינן נצברות. הואיל ומדובר
                במוצר דיגיטלי, לא יינתן החזר לאחר הורדת הקובץ, למעט במקרה של תקלה טכנית שלא אפשרה
                שימוש. כל עוד לא הורדו קבצים מההזמנה ניתן לבטל אותה ולקבל החזר מלא, באזור האישי
                תחת &quot;רכישות ומנויים&quot;. אין חידוש אוטומטי ואין חיוב חוזר.
              </p>
              <p>
                המנוי השנתי הוא מנוי למקצוע, וניתן להרחיבו עד 3 מקצועות באותו מחיר. מקצוע שנוסף
                במהלך תקופת המנוי יסתיים במועד סיום המנוי המקורי, ללא הארכה ובלי חיוב נוסף.
                &quot;ממלאת מקום 3 חודשים&quot; כוללת מקצוע אחד בלבד, מוגבלת ל-150 הורדות או צפיות,
                ואינה ניתנת להרחבה למקצועות נוספים.
              </p>
              <p>
                תקופת המנוי מתחילה בהורדה (או הצפייה) הראשונה ולא ביום הרכישה. מי שרכשה &quot;ממלאת
                מקום&quot; רשאית לשדרג בכל שלב למנוי שנתי בתשלום ההפרש בלבד: ב&quot;ממלאת מקום 3
                חודשים&quot; המנוי השנתי נמשך שנה מההורדה הראשונה בתוכנית, וב&quot;ממלאת מקום
                יומית&quot; – שנה מיום השדרוג.
              </p>
            </>
          ),
        },
        {
          icon: <MessagesSquare className={ic} strokeWidth={1.5} aria-hidden />,
          title: "פורום ותכנים של משתמשות",
          body: (
            <p>
              הפורום נועד לשיח מקצועי ומכבד. הנהלת האתר רשאית להסיר תוכן שאינו הולם ולחסום
              משתמשות שמפרות את הכללים.
            </p>
          ),
        },
        {
          icon: <Mail className={ic} strokeWidth={1.5} aria-hidden />,
          title: "יצירת קשר",
          body: (
            <p>
              לשאלות ובקשות בנוגע לתנאים אלה – <LegalLink href="/contact">צרי קשר</LegalLink>.
            </p>
          ),
        },
      ]}
    />
  );
}
