import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Cookie, Mail, Scale } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "מדיניות פרטיות" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <div className="animate-fade-up">
        <span className="chip bg-oak-soft text-oak-deep">
          <Scale className="h-3.5 w-3.5" aria-hidden /> משפטי
        </span>
        <h1 className="font-display mt-3 text-4xl font-black">מדיניות פרטיות</h1>
        <p className="mt-2 text-muted">עודכן לאחרונה: אוגוסט 2026</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        {[
          { icon: <Lock className="h-6 w-6" aria-hidden />, t: "מידע נשמר במאובטח", c: "bg-blue-soft text-blue-deep" },
          { icon: <Cookie className="h-6 w-6" aria-hidden />, t: "עוגייה חיונית בלבד להתחברות", c: "bg-gold-soft text-[#7a5b00]" },
          { icon: <Mail className="h-6 w-6" aria-hidden />, t: "לא מוכרות מידע לצד ג׳", c: "bg-pink-soft text-[#9d4a2a]" },
        ].map((b) => (
          <div key={b.t} className="card flex items-center gap-3 p-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${b.c}`}>{b.icon}</span>
            <span className="font-bold text-sm">{b.t}</span>
          </div>
        ))}
      </div>

      <article className="card mt-8 space-y-8 p-8 leading-relaxed">
        <section>
          <h2 className="text-xl font-bold">1. כללי</h2>
          <p className="mt-2 text-muted">
            מדיניות זו מסבירה אילו נתונים אתר {SITE_NAME} אוסף, לשם מה, איך הם נשמרים ולמי הם
            נחשפים. השימוש באתר מהווה הסכמה למדיניות זו.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">2. אילו נתונים נאספים</h2>
          <ul className="mt-2 text-muted list-disc pr-5 space-y-1.5">
            <li>
              <strong className="text-foreground">פרטי הרשמה:</strong> שם וכתובת מייל. הסיסמה נשמרת
              מוצפנת (hash) ואינה נגישה לאף אחד, כולל צוות האתר.
            </li>
            <li>
              <strong className="text-foreground">התחברות עם Google (אופציונלי):</strong> אם בוחרים
              בכניסה עם חשבון Google, מתקבלים ממנו שם, כתובת מייל ותמונת פרופיל.
            </li>
            <li>
              <strong className="text-foreground">היסטוריית שימוש:</strong> דפים שנצפו, זמני שהייה,
              הורדות שבוצעו, וזמן ההתחברות האחרון – לצורך הפעלת המנוי, מכסות ההורדה ותמיכה טכנית.
            </li>
            <li>
              <strong className="text-foreground">נתונים טכניים:</strong> כתובת IP וסוג דפדפן/מכשיר
              (User-Agent), הנרשמים בכל בקשה לצורך אבטחה, מניעת שימוש לרעה ותפעול האתר.
            </li>
            <li>
              <strong className="text-foreground">מידע תשלום:</strong> סכום, מסלול ותאריך הרכישה
              נשמרים אצלנו. פרטי כרטיס אשראי אינם נשמרים באתר – חיוב מתבצע מול ספק סליקה חיצוני
              מאובטח.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">3. עוגיות (Cookies)</h2>
          <p className="mt-2 text-muted">
            האתר משתמש בעוגייה חיונית אחת לצורך שמירת ההתחברות (session), ובמזהה סשן אנונימי לצורך
            מדידת תנועה. לא נעשה שימוש בעוגיות פרסום או מעקב של צד שלישי.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">4. הטבעת מספר אישי בקבצים</h2>
          <p className="mt-2 text-muted">
            כל קובץ שמורד מהאתר מוטבע במספר האישי של המורידה. פרטים נוספים בעמוד{" "}
            <Link href="/terms" className="text-blue-deep underline">
              תנאי השימוש
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">5. מי רואה את המידע</h2>
          <p className="mt-2 text-muted">
            המידע נגיש לצוות ניהול האתר בלבד, לצורך תפעול, תמיכה ומניעת שימוש לרעה. אנו משתפים
            פעולה עם ספקי תשתית לצורך הפעלת האתר בלבד – אחסון הקבצים והמסד ({SITE_NAME} מתארח על
            שירותי ענן), ושירות שליחת מיילים (Google) לצורך משלוח הודעות מהאתר (אישור הרשמה, קבלות,
            עדכוני מנוי). ספקים אלה מחויבים לשמור על סודיות המידע ואינם רשאים להשתמש בו למטרות
            אחרות. המידע אינו נמכר ואינו מועבר לגורמי פרסום.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">6. שמירת מידע</h2>
          <p className="mt-2 text-muted">
            המידע נשמר כל עוד החשבון פעיל, ולתקופה נוספת לאחר מכן ככל שנדרש לצרכים חשבונאיים,
            משפטיים או למניעת שימוש לרעה חוזר.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">7. הזכויות שלך</h2>
          <p className="mt-2 text-muted">
            ניתן בכל עת לצפות בפרטים האישיים ובהיסטוריית ההורדות והתשלומים באזור האישי, לעדכן שם,
            סיסמה וכתובת מייל, ולבקש עיון, תיקון או מחיקה של המידע השמור עלייך בפנייה דרך עמוד{" "}
            <Link href="/contact" className="text-blue-deep underline">
              צור קשר
            </Link>
            . שימו לב שמחיקת חשבון עשויה לבטל גישה למנוי פעיל וקבצים שנרכשו.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">8. יצירת קשר</h2>
          <p className="mt-2 text-muted">
            לשאלות בנוגע למדיניות זו או לבקשות הנוגעות למידע האישי שלך –{" "}
            <Link href="/contact" className="text-blue-deep underline">
              צרי קשר
            </Link>
            .
          </p>
        </section>
      </article>
    </div>
  );
}
