import type { Metadata } from "next";
import Link from "next/link";
import { Check, Crown, FileDown, FolderDown, Store, Sparkles, MessageSquare } from "lucide-react";
import { PLANS, TIERS, MATERIAL_KINDS, formatPrice } from "@/lib/constants";
import { getPlanPrices } from "@/lib/pricing";
import type { Tier } from "@/db/schema";
import { AnimatedGrid, Reveal } from "@/components/animated-grid";

export const metadata: Metadata = { title: "מסלולים ומחירים" };
export const dynamic = "force-dynamic";

const TIER_ORDER: Tier[] = ["iron", "copper", "silver", "gold", "diamond"];

const TIER_PERKS: Record<Tier, string[]> = {
  none: [],
  iron: ["גישה לפורום המורות", "מצגות מלוות"],
  copper: ["כל הטבות ברזל", "טיפים למסירת הפרק"],
  silver: ["כל הטבות נחושת", "שאלות מבגרויות קודמות עם פתרונות"],
  gold: ["כל הטבות כסף", "רעיונות, חידות וסיפורים", "עדיפות במענה בפורום"],
  diamond: ["כל הטבות זהב", "גישה מוקדמת לחומרים חדשים", "בקשות פרקים מותאמות אישית"],
};

export default async function PricingPage() {
  const prices = await getPlanPrices();
  const subs = [
    { key: "subject_monthly", tone: "from-blue to-blue-deep", badge: null },
    { key: "custom_monthly", tone: "from-pink to-[#db2777]", badge: "הכי משתלם" },
    { key: "yearly", tone: "from-[#f2c94c] to-gold", badge: "לכל השנה" },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <div className="text-center animate-fade-up">
        <span className="chip bg-blue-soft text-blue-deep">מחירים ברורים, בלי הפתעות</span>
        <h1 className="font-display mt-3 text-4xl font-black md:text-5xl">מסלולים ומחירים</h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted">
          מהיחידה הקטנה ביותר – פרק בודד – ועד מנוי שנתי לכל המקצועות. בחרי מה שמתאים למערכת
          השעות שלך.
        </p>
      </div>

      {/* רכישות חד-פעמיות */}
      <AnimatedGrid className="mt-10 grid gap-5 md:grid-cols-2">
        <div className="card card-hover flex h-full gap-4 p-6">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-soft text-blue-deep">
            <FileDown className="h-7 w-7" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-bold">{PLANS.single.label}</h2>
            <p className="mt-1 text-muted">{PLANS.single.description}</p>
            <div className="mt-3 font-display text-3xl font-bold text-blue-deep">
              החל מ-{formatPrice(1500)}
              <span className="text-sm font-sans font-medium text-muted"> לקובץ</span>
            </div>
            <p className="mt-2 text-sm text-muted">המחיר משתנה לפי הקובץ ומוצג ליד כל חומר.</p>
            <Link href="/subjects" className="btn btn-ghost mt-4 text-sm">
              לבחירת פרק
            </Link>
          </div>
        </div>
        <div className="card card-hover flex h-full gap-4 p-6">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-oak-soft text-oak-deep">
            <FolderDown className="h-7 w-7" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-bold">{PLANS.bundle.label}</h2>
            <p className="mt-1 text-muted">{PLANS.bundle.description}</p>
            <div className="mt-3 font-display text-3xl font-bold text-oak-deep">
              מחיר לתיקייה
              <span className="text-sm font-sans font-medium text-muted"> – מוצג בתיקייה</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              כפתור &quot;הורידי את כל התיקייה&quot; מופיע בתיקיות שזמינות כקובץ מורחב.
            </p>
            <Link href="/subjects" className="btn btn-ghost mt-4 text-sm">
              לתיקיות
            </Link>
          </div>
        </div>
      </AnimatedGrid>

      {/* מנויים */}
      <section className="mt-16" aria-labelledby="subs-h">
        <Reveal className="text-center">
          <h2 id="subs-h" className="font-display text-3xl font-bold">
            מנויים
          </h2>
          <p className="mt-2 text-muted">הורדות חופשיות במסגרת המכסה – בלי לחשב כל קובץ.</p>
        </Reveal>
        <AnimatedGrid className="mt-8 grid gap-6 md:grid-cols-3">
          {subs.map(({ key, tone, badge }) => {
            const p = PLANS[key];
            return (
              <div key={key} className="card card-hover relative flex h-full flex-col overflow-hidden">
                <div className={`bg-gradient-to-br ${tone} p-6 text-white`}>
                  {badge && (
                    <span className="chip bg-white/20 text-white backdrop-blur">{badge}</span>
                  )}
                  <h3 className="font-display mt-2 text-2xl font-bold">{p.label}</h3>
                  <div className="mt-2 text-4xl font-black">
                    {formatPrice(prices.plans[key])}
                    <span className="text-sm font-medium opacity-90">
                      {" "}
                      / {p.days === 365 ? "שנה" : "חודש"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-muted">{p.description}</p>
                  <ul className="mt-4 space-y-2 text-sm">
                    <li className="flex gap-2">
                      <Check className="h-4 w-4 shrink-0 text-blue" aria-hidden /> עד {p.downloadsLimit} הורדות
                    </li>
                    <li className="flex gap-2">
                      <Check className="h-4 w-4 shrink-0 text-blue" aria-hidden /> דפי שכפול לתלמידה ולמורה
                    </li>
                    <li className="flex gap-2">
                      <Check className="h-4 w-4 shrink-0 text-blue" aria-hidden /> תוקף {p.days} ימים
                    </li>
                    <li className="flex gap-2 text-muted">
                      <Crown className="h-4 w-4 shrink-0 text-gold" aria-hidden /> ניתן להוסיף פרימיום
                    </li>
                  </ul>
                  <Link href={`/checkout?plan=${key}`} className="btn btn-primary mt-auto pt-3">
                    בחירת מסלול
                  </Link>
                </div>
              </div>
            );
          })}
        </AnimatedGrid>
      </section>

      {/* פרימיום */}
      <section className="mt-16" aria-labelledby="premium-h">
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-l from-gold-soft via-white to-pink-soft p-8 md:p-10">
            <Reveal>
              <span className="chip btn-gold">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> תוספת פרימיום
              </span>
              <h2 id="premium-h" className="font-display mt-3 text-3xl font-bold">
                <span className="gold-text">פרימיום</span> – {formatPrice(prices.premiumAddon)} לחודש
              </h2>
              <p className="mt-2 max-w-2xl text-muted">
                מתווסף לכל מנוי ופותח את החומרים המיוחדים: פורום מורות, רעיונות וחידות, שאלות
                מבגרויות קודמות, מצגות וטיפים. הרמה שלך עולה עם הזמן והפעילות – מברזל ועד יהלום.
              </p>
            </Reveal>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { icon: <MessageSquare className="h-4 w-4" aria-hidden />, t: "פורום מורות" },
                { icon: MATERIAL_KINDS.ideas.icon, t: MATERIAL_KINDS.ideas.label },
                { icon: MATERIAL_KINDS.past_exam.icon, t: MATERIAL_KINDS.past_exam.label },
                { icon: MATERIAL_KINDS.presentation.icon, t: MATERIAL_KINDS.presentation.label },
                { icon: MATERIAL_KINDS.tips.icon, t: MATERIAL_KINDS.tips.label },
              ].map((b) => (
                <span key={b.t} className="chip bg-white text-foreground shadow-sm">
                  {b.icon} {b.t}
                </span>
              ))}
            </div>
            <Link href="/checkout?premium=1" className="btn btn-gold mt-6">
              <Crown className="h-5 w-5" aria-hidden /> הוספת פרימיום
            </Link>
          </div>

          <div className="p-6 md:p-8">
            <h3 className="font-bold text-lg">סולם הרמות</h3>
            <AnimatedGrid className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {TIER_ORDER.map((t, i) => {
                const tier = TIERS[t];
                return (
                  <div
                    key={t}
                    className="card card-hover relative h-full p-4"
                    style={{ borderTop: `4px solid ${tier.color}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-10 w-10 place-items-center rounded-full text-2xl animate-float"
                        style={{ background: tier.color + "22", animationDelay: `${i * 0.35}s` }}
                      >
                        {tier.icon}
                      </span>
                      <div>
                        <div className="font-display text-lg font-bold" style={{ color: tier.color }}>
                          {tier.label}
                        </div>
                        <div className="text-xs text-muted">רמה {tier.order}</div>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {TIER_PERKS[t].map((perk) => (
                        <li key={perk} className="flex gap-1.5">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: tier.color }} aria-hidden />
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </AnimatedGrid>
          </div>
        </div>
      </section>

      {/* מכירת חומרים */}
      <section className="mt-16">
        <Reveal>
          <div className="wood flex flex-col items-start gap-4 rounded-3xl p-8 text-white md:flex-row md:items-center">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15">
              <Store className="h-7 w-7" aria-hidden />
            </span>
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold">יש לך חומרים משלך?</h2>
              <p className="mt-1 text-white/90">
                מורות מנוסות מוזמנות למכור למנהל האתר מערכי שיעור, דפי עבודה ומצגות – ולהרוויח.
              </p>
            </div>
            <Link href="/sell" className="btn bg-white text-oak-deep shadow-lg">
              מכירת חומרים למנהל האתר
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
