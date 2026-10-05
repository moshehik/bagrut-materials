import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Fingerprint, Scale, Copyright } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "תנאי שימוש וזכויות יוצרים" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <div className="animate-fade-up">
        <span className="chip bg-oak-soft text-oak-deep">
          <Scale className="h-3.5 w-3.5" aria-hidden /> משפטי
        </span>
        <h1 className="font-display mt-3 text-4xl font-black">תנאי שימוש וזכויות יוצרים</h1>
        <p className="mt-2 text-muted">עודכן לאחרונה: אוגוסט 2026</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        {[
          { icon: <Fingerprint className="h-6 w-6" aria-hidden />, t: "מספר אישי בכל קובץ", c: "bg-blue-soft text-blue-deep" },
          { icon: <ShieldCheck className="h-6 w-6" aria-hidden />, t: "העברה הלאה – חשיפה לתביעה", c: "bg-pink-soft text-[#9d4a2a]" },
          { icon: <Copyright className="h-6 w-6" aria-hidden />, t: "כל הזכויות שמורות", c: "bg-gold-soft text-[#7a5b00]" },
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
            אתר {SITE_NAME} מציע למורות במחוז החרדי חומרי הוראה מוכנים: דפי שכפול, מערכי שיעור,
            מצגות, שאלות מבגרויות קודמות, טיפים ורעיונות. השימוש באתר ובחומרים מהווה הסכמה
            לתנאים אלה.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">2. רישיון שימוש אישי</h2>
          <p className="mt-2 text-muted">
            כל רכישה או הורדה מעניקה למורה רישיון אישי, לא בלעדי ולא ניתן להעברה, להשתמש בחומר
            לצורכי הוראה בכיתותיה בלבד. מותר לשכפל את דפי העבודה לתלמידותיה. אסור למכור, לשתף,
            לפרסם, להעלות לקבוצות או לאתרים אחרים, או להעביר את הקבצים לכל אדם אחר.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">3. הטבעת מספר אישי</h2>
          <p className="mt-2 text-muted">
            <strong className="text-foreground">כל קובץ שמורד מהאתר מוטבע במספר האישי של המורידה</strong>{" "}
            ובהודעת זכויות יוצרים. ההטבעה מאפשרת לזהות את מקור הקובץ במקרה של הפצה בלתי מורשית.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">4. הפצה בלתי מורשית</h2>
          <p className="mt-2 text-muted">
            <strong className="text-foreground">העברת קובץ הלאה, במלואו או בחלקו, חושפת את המעבירה לתביעה</strong>{" "}
            אזרחית בגין הפרת זכויות יוצרים ולסגירת החשבון ללא החזר כספי. אנו רואות בכך פגיעה
            ישירה ביוצרות החומרים ובאפשרות להמשיך ולהציע אותם במחירים נמוכים.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">5. זכויות יוצרים</h2>
          <p className="mt-2 text-muted">
            <strong className="text-foreground">כל הזכויות שמורות</strong> ל{SITE_NAME} וליוצרות
            החומרים. כל החומרים, העיצובים, הטקסטים והמצגות מוגנים בזכויות יוצרים. אין להעתיק,
            לשנות או ליצור יצירות נגזרות ללא אישור בכתב.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">6. מנויים, מכסות והחזרים</h2>
          <p className="mt-2 text-muted">
            מנוי מקנה מספר הורדות מוגדר לתקופה. הורדות שלא נוצלו אינן נצברות. הואיל ומדובר במוצר
            דיגיטלי, לא יינתן החזר לאחר הורדת הקובץ, למעט במקרה של תקלה טכנית שלא אפשרה שימוש.
            כל עוד לא הורדו קבצים מההזמנה ניתן לבטל אותה ולקבל החזר מלא, באזור האישי תחת
            &quot;רכישות ומנויים&quot;. אין חידוש אוטומטי ואין חיוב חוזר.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">7. פורום ותכנים של משתמשות</h2>
          <p className="mt-2 text-muted">
            הפורום נועד לשיח מקצועי ומכבד. הנהלת האתר רשאית להסיר תוכן שאינו הולם ולחסום
            משתמשות שמפרות את הכללים.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">8. יצירת קשר</h2>
          <p className="mt-2 text-muted">
            לשאלות ובקשות בנוגע לתנאים אלה –{" "}
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
