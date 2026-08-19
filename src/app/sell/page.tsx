import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Store, Coins, SearchCheck, Handshake, Link2, Clock } from "lucide-react";
import { db } from "@/db";
import { sellOffers } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getRootSubjects } from "@/lib/data";
import { formatPrice } from "@/lib/constants";
import { SellForm } from "@/components/sell-form";

export const metadata: Metadata = { title: "מכירת חומרים" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "ממתינה לבדיקה", cls: "bg-gold-soft text-[#8a6500]" },
  reviewing: { label: "בבדיקה", cls: "bg-blue-soft text-blue-deep" },
  accepted: { label: "התקבלה", cls: "bg-emerald-50 text-emerald-800" },
  approved: { label: "אושרה", cls: "bg-emerald-50 text-emerald-800" },
  purchased: { label: "נרכשה", cls: "bg-emerald-50 text-emerald-800" },
  rejected: { label: "לא התאימה", cls: "bg-pink-soft text-[#9d4a2a]" },
};

const STEPS = [
  {
    icon: Store,
    title: "שולחת הצעה",
    text: "ממלאת את הטופס: מקצוע, שם החומר, תיאור ומחיר מבוקש. אפשר לצרף קישור לדוגמה.",
    cls: "bg-blue-soft text-blue-deep",
  },
  {
    icon: SearchCheck,
    title: "מנהלת האתר בודקת",
    text: "כל הצעה נבדקת ידנית – איכות, התאמה לתוכנית הבגרות במחוז ומקוריות.",
    cls: "bg-pink-soft text-pink",
  },
  {
    icon: Handshake,
    title: "מסכמות מחיר",
    text: "אם החומר טוב – חוזרים אלייך במייל, מסכמים תמורה, והחומר עולה לאתר.",
    cls: "bg-oak-soft text-oak-deep",
  },
  {
    icon: Coins,
    title: "מקבלת תשלום",
    text: "התשלום נעשה כרכישה חד-פעמית של החומר. זכויות היוצרים נשמרות ומוגנות בהטבעה אישית.",
    cls: "bg-gold-soft text-[#8a6500]",
  },
];

export default async function SellPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/sell");

  const [subjects, offers] = await Promise.all([
    getRootSubjects(),
    db.select().from(sellOffers).where(eq(sellOffers.userId, user.id)).orderBy(desc(sellOffers.createdAt)),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      <header className="animate-fade-up max-w-2xl">
        <p className="text-sm text-muted flex items-center gap-1">
          <Store className="h-4 w-4" /> למורות יוצרות
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold">יש לך חומרים טובים? נשמח לקנות</h1>
        <p className="text-muted mt-2 leading-relaxed">
          הכנת מערך שיעור מצוין, דפי שכפול או מצגת שעבדו בכיתה? מנהלת האתר עוברת על ההצעות ורוכשת
          חומרים איכותיים – כך מורות אחרות נהנות מהעבודה שלך, ואת מקבלת תמורה הוגנת.
        </p>
      </header>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card p-4 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`grid place-items-center h-10 w-10 rounded-xl ${s.cls}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <p className="font-bold mt-3">
              <span className="text-muted font-normal me-1">{i + 1}.</span>
              {s.title}
            </p>
            <p className="text-sm text-muted mt-1 leading-relaxed">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] items-start">
        <section className="card p-6 sm:p-8 animate-fade-up">
          <h2 className="font-bold text-xl mb-4">הצעת מכירה חדשה</h2>
          <SellForm subjects={subjects.map((s) => s.title)} />
        </section>

        <section className="card p-6 animate-fade-up [animation-delay:100ms]">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue" /> ההצעות שלי
          </h2>
          {offers.length === 0 ? (
            <p className="text-sm text-muted">עדיין לא שלחת הצעות. ההצעה הראשונה שלך תופיע כאן עם הסטטוס שלה.</p>
          ) : (
            <ul className="space-y-3">
              {offers.map((o) => {
                const st = STATUS[o.status] ?? { label: o.status, cls: "bg-blue-soft text-blue-deep" };
                return (
                  <li key={o.id} className="rounded-xl border border-foreground/10 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug">{o.title}</p>
                        <p className="text-xs text-muted">
                          {o.subject}
                          {o.askingPrice !== null && <> · {formatPrice(o.askingPrice)}</>}
                          {" · "}
                          {o.createdAt.toLocaleDateString("he-IL")}
                        </p>
                      </div>
                      <span className={`chip shrink-0 ${st.cls}`}>{st.label}</span>
                    </div>
                    {o.fileUrl && (
                      <a
                        href={o.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-deep hover:underline inline-flex items-center gap-1 mt-2"
                      >
                        <Link2 className="h-3 w-3" /> קישור לדוגמה
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
