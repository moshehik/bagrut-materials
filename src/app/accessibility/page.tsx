import type { Metadata } from "next";
import Link from "next/link";
import { Accessibility, Keyboard, Eye, MousePointerClick } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "הצהרת נגישות" };

const TOGGLES = [
  { icon: "🔎", t: "הגדלת טקסט", d: "מגדילה את כל הטקסט באתר בכ-18%." },
  { icon: "◐", t: "ניגודיות גבוהה", d: "רקע לבן, טקסט שחור וצבעים כהים יותר לקריאה נוחה." },
  { icon: "🔗", t: "הדגשת קישורים", d: "כל הקישורים מקבלים קו תחתון בולט." },
  { icon: "⏸", t: "עצירת אנימציות", d: "מבטלת תנועות ומעברים באתר." },
  { icon: "Aa", t: "פונט קריא", d: "מחליפה את גופני האתר בגופן פשוט וקריא." },
];

export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <div className="animate-fade-up">
        <span className="chip bg-blue-soft text-blue-deep">
          <Accessibility className="h-3.5 w-3.5" aria-hidden /> נגישות
        </span>
        <h1 className="font-display mt-3 text-4xl font-black">הצהרת נגישות</h1>
        <p className="mt-3 leading-relaxed text-muted">
          אנחנו ב{SITE_NAME} רואות חשיבות רבה בהנגשת האתר לכל המורות, כולל מורות עם מוגבלויות.
          האתר נבנה בהתאם להנחיות WCAG 2.1 ברמה AA ולתקנות שוויון זכויות לאנשים עם מוגבלות
          (התאמות נגישות לשירות), התשע"ג-2013.
        </p>
      </div>

      <section className="card mt-8 p-8" aria-labelledby="widget-h">
        <h2 id="widget-h" className="text-xl font-bold flex items-center gap-2">
          <MousePointerClick className="h-5 w-5 text-pink" aria-hidden /> איך משתמשים בכפתור הנגישות?
        </h2>
        <p className="mt-2 text-muted leading-relaxed">
          בפינה השמאלית התחתונה של כל עמוד מופיע כפתור עגול כחול עם סמל נגישות. לחיצה עליו
          (או מיקוד עם Tab ולחיצה על Enter) פותחת תפריט עם ההתאמות הבאות. ההעדפות נשמרות
          בדפדפן שלך ונטענות אוטומטית בביקור הבא. כפתור &quot;איפוס&quot; מחזיר את האתר למצב
          המקורי, ומקש Escape סוגר את התפריט.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {TOGGLES.map((t) => (
            <li key={t.t} className="flex gap-3 rounded-2xl bg-blue-soft/50 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-base font-bold shadow-sm" aria-hidden>
                {t.icon}
              </span>
              <div>
                <div className="font-bold text-sm">{t.t}</div>
                <div className="text-sm text-muted">{t.d}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-6 p-8" aria-labelledby="builtin-h">
        <h2 id="builtin-h" className="text-xl font-bold flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-blue" aria-hidden /> התאמות מובנות באתר
        </h2>
        <ul className="mt-3 space-y-2 text-muted leading-relaxed list-disc ps-5">
          <li>ניווט מלא במקלדת, עם סימון מיקוד ברור וקישור &quot;דלגי לתוכן הראשי&quot;.</li>
          <li>מבנה כותרות היררכי, תיאורי alt וטקסט חלופי לסמלים.</li>
          <li>כיבוד הגדרת &quot;הפחתת תנועה&quot; של מערכת ההפעלה.</li>
          <li>ניגודיות צבעים תקנית בטקסט ובכפתורים.</li>
          <li>תצוגה מותאמת למסכים קטנים ולהגדלה עד 200%.</li>
        </ul>
      </section>

      <section className="card mt-6 p-8" aria-labelledby="contact-h">
        <h2 id="contact-h" className="text-xl font-bold flex items-center gap-2">
          <Eye className="h-5 w-5 text-gold" aria-hidden /> נתקלת בבעיה?
        </h2>
        <p className="mt-2 text-muted leading-relaxed">
          אם מצאת עמוד או רכיב שאינו נגיש – נשמח לדעת ולתקן. כתבי לנו דרך{" "}
          <Link href="/contact" className="text-blue-deep underline">
            עמוד יצירת הקשר
          </Link>{" "}
          או במייל{" "}
          <a href="mailto:moshehik@gmail.com" className="text-blue-deep underline">
            moshehik@gmail.com
          </a>
          , ונשתדל להשיב תוך 3 ימי עסקים.
        </p>
        <p className="mt-3 text-xs text-muted">הצהרה זו עודכנה באוגוסט 2026.</p>
      </section>
    </div>
  );
}
