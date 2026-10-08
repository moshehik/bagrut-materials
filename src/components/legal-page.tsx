import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { AnimatedGrid } from "@/components/animated-grid";

export type LegalHighlight = { icon: ReactNode; text: string };
export type LegalSection = { icon: ReactNode; title: string; body: ReactNode };

/** קישור בתוך כרטיס זהב */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-bold text-[#16244e] underline underline-offset-4">
      {children}
    </Link>
  );
}

/** פריט רשימה בכרטיס: אגוז במקום נקודה */
export function LegalItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/nut-check.png" alt="" aria-hidden className="mt-0.5 h-7 w-auto shrink-0" />
      <span>{children}</span>
    </li>
  );
}

/**
 * עמוד משפטי (תנאי שימוש / מדיניות פרטיות) באותו סגנון של עמוד "מסלולים ומחירים":
 * כותרת עם לוגו, חלונית כחולה כהה עם מסגרת זהב מנצנצת, וכרטיסי זהב בהיר במסגרת שחורה.
 */
export function LegalPage({
  title,
  intro,
  updated,
  highlights,
  sections,
  other,
}: {
  title: string;
  intro: string;
  updated: string;
  highlights: LegalHighlight[];
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  const arrow = <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
        <div>
          <h1 className="text-4xl md:text-5xl">{title}</h1>
          <p className="mt-2 max-w-md">{intro}</p>
          <p className="mt-1 text-base opacity-70">עודכן לאחרונה: {updated}</p>
        </div>
      </div>

      {/* עיקרי הדברים */}
      <section className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8" aria-label="עיקרי הדברים">
        <span className="gold-ring" aria-hidden="true" />
        <AnimatedGrid className="grid gap-5 sm:grid-cols-3">
          {highlights.map((h) => (
            <div key={h.text} className="gate-card flex flex-col items-center gap-3 text-center">
              <span className="gate-icon">{h.icon}</span>
              <span className="text-xl leading-snug">{h.text}</span>
            </div>
          ))}
        </AnimatedGrid>
      </section>

      {/* הסעיפים */}
      <section className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8">
        <span className="gold-ring" aria-hidden="true" />
        <AnimatedGrid className="grid gap-6">
          {sections.map((s, i) => (
            <article key={s.title} className="gate-card !p-5">
              <header className="flex items-center gap-3">
                <span className="gate-icon shrink-0">{s.icon}</span>
                <h2 className="text-2xl sm:text-3xl">
                  {i + 1}. {s.title}
                </h2>
              </header>
              <hr className="gate-divider" />
              <div className="space-y-3 text-xl leading-relaxed">{s.body}</div>
            </article>
          ))}
        </AnimatedGrid>
      </section>

      {/* יצירת קשר + מעבר לעמוד המשפטי השני */}
      <section className="gate-panel mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <span className="gold-ring" aria-hidden="true" />
        <p className="text-2xl">יש שאלה? אנחנו כאן.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/contact" className="btn btn-gold btn-gate py-2">
            <Mail className="h-4 w-4" aria-hidden /> צרי קשר
          </Link>
          <Link href={other.href} className="btn btn-gold btn-gate py-2">
            {other.label} {arrow}
          </Link>
        </div>
      </section>
    </div>
  );
}
