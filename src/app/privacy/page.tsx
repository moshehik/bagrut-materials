import type { Metadata } from "next";
import {
  Lock,
  Cookie,
  Handshake,
  FileText,
  Database,
  Fingerprint,
  Eye,
  Clock,
  UserCheck,
  Mail,
} from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { LegalPage, LegalLink, LegalItem } from "@/components/legal-page";

export const metadata: Metadata = { title: "מדיניות פרטיות" };

const ic = "h-6 w-6";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="מדיניות פרטיות"
      intro="איזה מידע נשמר, למה, ומי רואה אותו – בלי מילים גבוהות."
      updated="אוגוסט 2026"
      other={{ href: "/terms", label: "תנאי שימוש" }}
      highlights={[
        { icon: <Lock className={ic} strokeWidth={1.5} aria-hidden />, text: "מידע נשמר במאובטח" },
        { icon: <Cookie className={ic} strokeWidth={1.5} aria-hidden />, text: "עוגייה חיונית בלבד להתחברות" },
        { icon: <Handshake className={ic} strokeWidth={1.5} aria-hidden />, text: "לא מוכרות מידע לצד ג׳" },
      ]}
      sections={[
        {
          icon: <FileText className={ic} strokeWidth={1.5} aria-hidden />,
          title: "כללי",
          body: (
            <p>
              מדיניות זו מסבירה אילו נתונים אתר {SITE_NAME} אוסף, לשם מה, איך הם נשמרים ולמי הם
              נחשפים. השימוש באתר מהווה הסכמה למדיניות זו.
            </p>
          ),
        },
        {
          icon: <Database className={ic} strokeWidth={1.5} aria-hidden />,
          title: "אילו נתונים נאספים",
          body: (
            <ul className="space-y-2.5">
              <LegalItem>
                <strong>פרטי הרשמה:</strong> שם וכתובת מייל. הסיסמה נשמרת מוצפנת (hash) ואינה
                נגישה לאף אחד, כולל צוות האתר.
              </LegalItem>
              <LegalItem>
                <strong>התחברות עם Google (אופציונלי):</strong> אם בוחרים בכניסה עם חשבון Google,
                מתקבלים ממנו שם, כתובת מייל ותמונת פרופיל.
              </LegalItem>
              <LegalItem>
                <strong>היסטוריית שימוש:</strong> דפים שנצפו, זמני שהייה, הורדות שבוצעו, וזמן
                ההתחברות האחרון – לצורך הפעלת המנוי, מכסות ההורדה ותמיכה טכנית.
              </LegalItem>
              <LegalItem>
                <strong>נתונים טכניים:</strong> כתובת IP וסוג דפדפן/מכשיר (User-Agent), הנרשמים
                בכל בקשה לצורך אבטחה, מניעת שימוש לרעה ותפעול האתר.
              </LegalItem>
              <LegalItem>
                <strong>מידע תשלום:</strong> סכום, מסלול ותאריך הרכישה נשמרים אצלנו. פרטי כרטיס
                אשראי אינם נשמרים באתר – חיוב מתבצע מול ספק סליקה חיצוני מאובטח.
              </LegalItem>
            </ul>
          ),
        },
        {
          icon: <Cookie className={ic} strokeWidth={1.5} aria-hidden />,
          title: "עוגיות (Cookies)",
          body: (
            <p>
              האתר משתמש בעוגייה חיונית אחת לצורך שמירת ההתחברות (session), ובמזהה סשן אנונימי
              לצורך מדידת תנועה. לא נעשה שימוש בעוגיות פרסום או מעקב של צד שלישי.
            </p>
          ),
        },
        {
          icon: <Fingerprint className={ic} strokeWidth={1.5} aria-hidden />,
          title: "הטבעת מספר אישי בקבצים",
          body: (
            <p>
              כל קובץ שמורד מהאתר מוטבע במספר האישי של המורידה. פרטים נוספים בעמוד{" "}
              <LegalLink href="/terms">תנאי השימוש</LegalLink>.
            </p>
          ),
        },
        {
          icon: <Eye className={ic} strokeWidth={1.5} aria-hidden />,
          title: "מי רואה את המידע",
          body: (
            <p>
              המידע נגיש לצוות ניהול האתר בלבד, לצורך תפעול, תמיכה ומניעת שימוש לרעה. אנו משתפים
              פעולה עם ספקי תשתית לצורך הפעלת האתר בלבד – אחסון הקבצים והמסד ({SITE_NAME} מתארח על
              שירותי ענן), ושירות שליחת מיילים (Google) לצורך משלוח הודעות מהאתר (אישור הרשמה,
              קבלות, עדכוני מנוי). ספקים אלה מחויבים לשמור על סודיות המידע ואינם רשאים להשתמש בו
              למטרות אחרות. המידע אינו נמכר ואינו מועבר לגורמי פרסום.
            </p>
          ),
        },
        {
          icon: <Clock className={ic} strokeWidth={1.5} aria-hidden />,
          title: "שמירת מידע",
          body: (
            <p>
              המידע נשמר כל עוד החשבון פעיל, ולתקופה נוספת לאחר מכן ככל שנדרש לצרכים חשבונאיים,
              משפטיים או למניעת שימוש לרעה חוזר.
            </p>
          ),
        },
        {
          icon: <UserCheck className={ic} strokeWidth={1.5} aria-hidden />,
          title: "הזכויות שלך",
          body: (
            <p>
              ניתן בכל עת לצפות בפרטים האישיים ובהיסטוריית ההורדות והתשלומים באזור האישי, לעדכן
              שם, סיסמה וכתובת מייל, ולבקש עיון, תיקון או מחיקה של המידע השמור עלייך בפנייה דרך
              עמוד <LegalLink href="/contact">צור קשר</LegalLink>. שימו לב שמחיקת חשבון עשויה לבטל
              גישה למנוי פעיל וקבצים שנרכשו.
            </p>
          ),
        },
        {
          icon: <Mail className={ic} strokeWidth={1.5} aria-hidden />,
          title: "יצירת קשר",
          body: (
            <p>
              לשאלות בנוגע למדיניות זו או לבקשות הנוגעות למידע האישי שלך –{" "}
              <LegalLink href="/contact">צרי קשר</LegalLink>.
            </p>
          ),
        },
      ]}
    />
  );
}
