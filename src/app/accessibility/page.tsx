import type { Metadata } from "next";
import {
  Accessibility,
  Keyboard,
  MousePointerClick,
  SlidersHorizontal,
  Smartphone,
  Scale,
  Eye,
  Mail,
  Info,
} from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { LegalPage, LegalLink, LegalItem } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "הצהרת נגישות",
  description: "ההתאמות שבאתר לשימוש נגיש, איך משתמשים בכפתור הנגישות ואיך מדווחים על תקלה.",
};

const EMAIL = "loozhainyan@gmail.com";
const ic = "h-6 w-6";

const TOGGLES = [
  { t: "הגדלת טקסט", d: "מגדילה את כל הטקסט באתר בכ-18%." },
  { t: "ניגודיות גבוהה", d: "רקע לבן, טקסט שחור וצבעים כהים יותר לקריאה נוחה." },
  { t: "הדגשת קישורים", d: "כל הקישורים מקבלים קו תחתון בולט." },
  { t: "עצירת אנימציות", d: "מבטלת תנועות ומעברים באתר." },
  { t: "פונט קריא", d: "מחליפה את גופני האתר בגופן פשוט וקריא." },
];

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="הצהרת נגישות"
      intro="האתר נועד לכל המורות – כך הוא מותאם לשימוש נגיש, ואיך מדווחים על תקלה."
      updated="אוקטובר 2026"
      other={{ href: "/privacy", label: "מדיניות פרטיות" }}
      highlights={[
        { icon: <Accessibility className={ic} strokeWidth={1.5} aria-hidden />, text: "כפתור נגישות בכל עמוד" },
        { icon: <Keyboard className={ic} strokeWidth={1.5} aria-hidden />, text: "ניווט מלא במקלדת" },
        { icon: <Smartphone className={ic} strokeWidth={1.5} aria-hidden />, text: "מותאם גם לנייד" },
      ]}
      sections={[
        {
          icon: <Info className={ic} strokeWidth={1.5} aria-hidden />,
          title: "כללי",
          body: (
            <p>
              אנחנו ב{SITE_NAME} רואות חשיבות רבה בהנגשת האתר לכל המורות, כולל מורות עם מוגבלויות.
              האתר נבנה בהתאם להנחיות WCAG 2.1 ברמה AA ולתקנות שוויון זכויות לאנשים עם מוגבלות
              (התאמות נגישות לשירות), התשע״ג-2013.
            </p>
          ),
        },
        {
          icon: <MousePointerClick className={ic} strokeWidth={1.5} aria-hidden />,
          title: "איך משתמשים בכפתור הנגישות?",
          body: (
            <p>
              בפינה השמאלית התחתונה של כל עמוד מופיע כפתור עגול עם סמל נגישות. לחיצה עליו (או
              מיקוד עם Tab ולחיצה על Enter) פותחת תפריט התאמות. ההעדפות נשמרות בדפדפן ונטענות
              אוטומטית בביקור הבא. כפתור ״איפוס״ מחזיר את האתר למצב המקורי, ומקש Escape סוגר את
              התפריט.
            </p>
          ),
        },
        {
          icon: <SlidersHorizontal className={ic} strokeWidth={1.5} aria-hidden />,
          title: "ההתאמות בתפריט",
          body: (
            <ul className="space-y-2.5">
              {TOGGLES.map((t) => (
                <LegalItem key={t.t}>
                  <strong>{t.t}:</strong> {t.d}
                </LegalItem>
              ))}
            </ul>
          ),
        },
        {
          icon: <Keyboard className={ic} strokeWidth={1.5} aria-hidden />,
          title: "התאמות מובנות באתר",
          body: (
            <ul className="space-y-2.5">
              <LegalItem>ניווט מלא במקלדת, עם סימון מיקוד ברור וקישור ״דלגי לתוכן הראשי״.</LegalItem>
              <LegalItem>מבנה כותרות היררכי, תיאורי alt וטקסט חלופי לסמלים.</LegalItem>
              <LegalItem>כיבוד הגדרת ״הפחתת תנועה״ של מערכת ההפעלה.</LegalItem>
              <LegalItem>ניגודיות צבעים תקנית בטקסט ובכפתורים.</LegalItem>
              <LegalItem>תצוגה מותאמת למסכים קטנים ולהגדלה עד 200%.</LegalItem>
            </ul>
          ),
        },
        {
          icon: <Scale className={ic} strokeWidth={1.5} aria-hidden />,
          title: "מגבלות ידועות",
          body: (
            <p>
              אנו פועלות לשפר את הנגישות באופן מתמיד, ועם זאת ייתכן שחלק מהקבצים להורדה (דפי עבודה
              ומצגות) אינם נגישים במלואם לתוכנות הקראה. אם נתקלת בקובץ כזה – פני אלינו ונשתדל לספק
              גרסה מותאמת.
            </p>
          ),
        },
        {
          icon: <Eye className={ic} strokeWidth={1.5} aria-hidden />,
          title: "נתקלת בבעיה?",
          body: (
            <p>
              אם מצאת עמוד או רכיב שאינו נגיש – נשמח לדעת ולתקן. כתבי לנו דרך{" "}
              <LegalLink href="/contact">עמוד יצירת הקשר</LegalLink>, ונשתדל להשיב תוך 3 ימי עסקים.
            </p>
          ),
        },
        {
          icon: <Mail className={ic} strokeWidth={1.5} aria-hidden />,
          title: "פרטי רכזת הנגישות",
          body: (
            <p>
              מנהלת האתר משמשת גם רכזת הנגישות. במייל:{" "}
              <a
                href={`mailto:${EMAIL}?subject=${encodeURIComponent("נגישות באתר")}`}
                dir="ltr"
                className="font-bold text-[#16244e] underline underline-offset-4"
              >
                {EMAIL}
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
