import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquare, Store, HelpCircle } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "צרי קשר" };

const EMAIL = "moshehik@gmail.com";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <div className="text-center animate-fade-up">
        <span className="chip bg-pink-soft text-[#9d174d]">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden /> נשמח לשמוע ממך
        </span>
        <h1 className="font-display mt-3 text-4xl font-black">צרי קשר</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted leading-relaxed">
          שאלה על מנוי, בקשה לפרק שחסר, בעיה בהורדה או סתם מילה טובה – כותבים לנו במייל ואנחנו
          עונות בהקדם.
        </p>
      </div>

      <div className="card mt-10 overflow-hidden animate-pop" style={{ animationDelay: "0.1s" }}>
        <div className="bg-gradient-to-l from-blue-soft via-white to-pink-soft p-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue to-blue-deep text-white shadow-lg shadow-blue/30 animate-float">
            <Mail className="h-8 w-8" aria-hidden />
          </span>
          <div className="mt-4 text-sm text-muted">כתובת המייל שלנו</div>
          <a
            href={`mailto:${EMAIL}?subject=${encodeURIComponent(`פנייה מאתר ${SITE_NAME}`)}`}
            className="font-display mt-1 inline-block text-2xl font-bold text-blue-deep hover:underline sm:text-3xl"
            dir="ltr"
          >
            {EMAIL}
          </a>
          <div className="mt-5">
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent(`פנייה מאתר ${SITE_NAME}`)}`}
              className="btn btn-primary"
            >
              <Mail className="h-5 w-5" aria-hidden /> שליחת מייל
            </a>
          </div>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-3 text-sm">
          <div className="rounded-2xl bg-blue-soft/50 p-4">
            <HelpCircle className="h-5 w-5 text-blue" aria-hidden />
            <div className="mt-2 font-bold">שאלות על מנוי</div>
            <p className="text-muted">
              כדאי לציין את המייל שאיתו נרשמת ואת המסלול. פרטי המסלולים ב
              <Link href="/pricing" className="text-blue-deep underline">
                מחירים
              </Link>
              .
            </p>
          </div>
          <div className="rounded-2xl bg-pink-soft/50 p-4">
            <MessageSquare className="h-5 w-5 text-pink" aria-hidden />
            <div className="mt-2 font-bold">שאלות מקצועיות</div>
            <p className="text-muted">
              למנויות פרימיום –{" "}
              <Link href="/forum" className="text-blue-deep underline">
                פורום המורות
              </Link>{" "}
              הוא המקום הכי מהיר לקבל תשובה.
            </p>
          </div>
          <div className="rounded-2xl bg-gold-soft/60 p-4">
            <Store className="h-5 w-5 text-gold" aria-hidden />
            <div className="mt-2 font-bold">מכירת חומרים</div>
            <p className="text-muted">
              יש לך חומרים משלך? מלאי את{" "}
              <Link href="/sell" className="text-blue-deep underline">
                טופס ההצעה
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        זמן מענה ממוצע: עד 3 ימי עסקים. בערבי חג ובחגים המענה עשוי להתעכב.
      </p>
    </div>
  );
}
