import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getPlanPrices } from "@/lib/pricing";
import { hasActiveSamePlan } from "@/lib/purchase-helpers";
import { campaignAmount, campaignIsOpen, getCampaign, getSeatStats, getUserSeat } from "@/lib/campaign";
import { PLANS, YEARLY_INCLUDED_SUBJECTS } from "@/lib/constants";
import { GateShekel } from "@/components/gate-shekel";
import { OfferLive } from "@/components/offer-live";

/*
 * /offer/<slug> – דף הנחיתה של קמפיין הנחה מוגבל במקומות (הקישור לפרסומות). ציבורי: מי שלא מחוברת מופנית להרשמה/התחברות וחוזרת לכאן;
 * מונה המקומות חי (OfferLive). אחרי תפיסת מקום → /pay?plan=yearly&campaign=<slug> (הסכום המוזל נקבע בשרת). לוגיקה: src/lib/campaign.ts.
 */
export const metadata: Metadata = {
  title: "מבצע לנרשמות הראשונות",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function OfferPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCampaign(slug);
  if (!c) notFound();

  const open = campaignIsOpen(c);
  const [stats, prices, user] = await Promise.all([getSeatStats(c), getPlanPrices(), getCurrentUser()]);
  const subscribed = user && c.plan === "yearly" ? await hasActiveSamePlan(user.id, "yearly") : false;
  const hasSeat = user ? !!(await getUserSeat(c.slug, user.id)) : false;

  const listAmount = prices.plans.yearly;
  const offerAmount = campaignAmount(listAmount, c.percent);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <section className="gate-panel animate-fade-up text-center sm:!p-8" aria-labelledby="offer-h">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-black.png" alt="לו״ז העניין" className="mx-auto w-40 sm:w-48" />
          <p className="gate-badge mt-4 inline-block">מבצע ל-{c.totalSeats} הנרשמות הראשונות</p>
          <h1 id="offer-h" className="mt-2 text-3xl sm:text-4xl">
            {c.percent}% הנחה על ה{PLANS.yearly.label}
          </h1>
          <div className="gate-price mt-3 text-3xl">
            <GateShekel agorot={offerAmount} />{" "}
            <s className="gate-old-price">
              <GateShekel agorot={listAmount} />
            </s>
            <span className="text-xl"> לשנה</span>
          </div>
          <p className="gate-soft mt-1 text-base">
            אפשר לשלם ב-12 תשלומים של <GateShekel agorot={Math.round(offerAmount / 12)} />.
          </p>

          <ul className="mx-auto mt-4 max-w-md space-y-1 text-start text-lg">
            <li className="flex gap-2">
              <Check className="mt-1 h-4 w-4 shrink-0" aria-hidden /> מנוי לשנה שלמה
            </li>
            <li className="flex gap-2">
              <Check className="mt-1 h-4 w-4 shrink-0" aria-hidden /> אפשר לבחור עד {YEARLY_INCLUDED_SUBJECTS} מקצועות באותו מחיר
            </li>
            <li className="flex gap-2">
              <Check className="mt-1 h-4 w-4 shrink-0" aria-hidden /> גישה לחומרים של המקצועות שבחרת – להורדה ולצפייה
            </li>
          </ul>

          <div className="mt-6">
            {!open ? (
              <>
                <p className="gate-soft text-lg">המבצע הסתיים.</p>
                <Link href="/pricing" className="btn btn-gold btn-gate mt-3 py-2">
                  למסלולים ומחירים
                </Link>
              </>
            ) : subscribed ? (
              <>
                <p className="gate-soft text-lg">כבר יש לך מנוי שנתי פעיל – המבצע מיועד למנויות חדשות.</p>
                <Link href="/account" className="btn btn-gold btn-gate mt-3 py-2">
                  לאזור האישי
                </Link>
              </>
            ) : (
              <OfferLive slug={c.slug} total={stats.total} initialRemaining={stats.remaining} loggedIn={!!user} hasSeat={hasSeat} />
            )}
          </div>

          <p className="gate-soft mt-6 text-sm">
            ההנחה חלה על מנויות חדשות בלבד, עד גמר המקומות. מקום נשמר לזמן קצר עד להשלמת התשלום – ואם התשלום לא הושלם הוא עובר לאחרות.
            הנהלת האתר רשאית לסיים את המבצע בכל עת.
          </p>
        </div>
      </section>
    </div>
  );
}
