import type { Metadata } from "next";
import Link from "next/link";
import { Mail, HelpCircle, MessagesSquare, Clock } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "צרי קשר",
  description: "שאלה, בקשה לחומר שחסר או בעיה בהורדה – כתבי לנו ונחזור אלייך בהקדם.",
};

const EMAIL = "loozhainyan@gmail.com";

/** באותו עיצוב של "מסלולים ומחירים": כותרת עם לוגו, חלונית כחולה עם מסגרת זהב, כרטיסי זהב בהיר במסגרת שחורה */
export default async function ContactPage() {
  const user = await getCurrentUser();
  const firstName = user?.name?.trim().split(/\s+/)[0] || null;
  const mailto =`mailto:${EMAIL}?subject=${encodeURIComponent(`פנייה מאתר ${SITE_NAME}`)}`;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
        <div>
          <h1 className="text-4xl md:text-5xl">צרי קשר</h1>
          <p className="mt-2 max-w-md">
            שאלה על מנוי, בקשה לפרק שחסר, בעיה בהורדה או סתם מילה טובה – כתבי לנו ונחזור אלייך
            למייל שתציני.
          </p>
        </div>
      </div>

      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8 animate-pop" aria-labelledby="contact-h">
        <span className="gold-ring" aria-hidden="true" />
        <h2 id="contact-h" className="text-center text-3xl">
          {firstName ? `שלום ${firstName}, יש לך מה לומר?` : "כתבי לנו!"}
        </h2>
        <p className="mb-5 mt-1 text-center text-base text-[#ffd45a]">ההודעה מגיעה ישירות למנהלת האתר.</p>
        <ContactForm defaultName={user?.name ?? ""} defaultEmail={user?.email ?? ""} />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-white/20 pt-4 text-base">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" aria-hidden /> זמן מענה ממוצע: עד 3 ימי עסקים
          </span>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Mail className="h-4 w-4" aria-hidden /> או ישירות במייל:
            <a href={mailto} dir="ltr" className="text-[#ffd45a] underline">
              {EMAIL}
            </a>
          </span>
        </div>
      </section>

      <div className="gate-title mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="gate-card">
          <HelpCircle className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          <h3 className="mt-1 text-2xl">שאלות על מנוי</h3>
          <p className="gate-soft">
            כדאי לציין את המייל שאיתו נרשמת ואת המסלול. פרטים ב
            <Link href="/pricing" className="underline">
              מחירים
            </Link>
            .
          </p>
        </div>
        <div className="gate-card">
          <MessagesSquare className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          <h3 className="mt-1 text-2xl">שאלות מקצועיות</h3>
          <p className="gate-soft">
            למנויות – בכל{" "}
            <Link href="/subjects" className="underline">
              יחידת לימוד
            </Link>{" "}
            מחכה פורום מורות לשאלות על השיעור.
          </p>
        </div>
      </div>

      <p className="gate-title mt-6 text-center text-base">בערבי חג המענה עשוי להתעכב.</p>
    </div>
  );
}
