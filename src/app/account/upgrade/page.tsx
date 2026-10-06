import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getPlanPrices } from "@/lib/pricing";
import { PLANS } from "@/lib/constants";
import { loadUpgradeOffers, formatTimeLeft } from "@/lib/upgrade";
import { upgradeToYearlyAction } from "@/lib/actions/upgrade";
import { addDays } from "@/lib/purchase-helpers";
import { BackButton, fmtDate } from "@/components/account-ui";
import { GateShekel } from "@/components/gate-shekel";

export const metadata: Metadata = { title: "שדרוג למנוי שנתי" };
export const dynamic = "force-dynamic";

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/upgrade");

  const prices = await getPlanPrices();
  const offers = await loadUpgradeOffers(user.id, prices.plans.yearly);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
        <div>
          <h1 className="text-4xl md:text-5xl">שדרוג למנוי שנתי</h1>
          <p className="mt-2 max-w-md">
            את משלמת רק את ההפרש: מחיר המנוי השנתי פחות מה ששילמת על התוכנית הנוכחית.
          </p>
          <BackButton href="/account/purchases" label="חזרה לרכישות ומנויים" />
        </div>
      </div>

      {msg && (
        <p role="status" className="gate-panel mx-auto mt-6 max-w-2xl text-center text-[#ffd45a]">
          {msg}
        </p>
      )}

      {offers.length === 0 && (
        <section className="gate-panel mx-auto mt-8 max-w-2xl text-center">
          <span className="gold-ring" aria-hidden="true" />
          <p className="text-xl">אין לך כרגע תוכנית ממלאת מקום פעילה שאפשר לשדרג.</p>
          <Link href="/pricing" className="btn btn-gold btn-gate mt-4 py-2">למסלולים</Link>
        </section>
      )}

      {offers.map((o) => {
        const plan = PLANS[o.kind === "daily" ? "substitute_daily" : "substitute_3m"];
        // מתי המנוי השנתי יסתיים אחרי השדרוג
        const newEnd =
          o.kind === "daily"
            ? `שנה מהיום (${fmtDate(addDays(365))})`
            : o.activatedAt
              ? `${fmtDate(addDays(365, o.activatedAt))} – שנה מההורדה הראשונה שלך בתוכנית`
              : "שנה מההורדה הראשונה";
        return (
          <section key={o.rows[0].id} className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8">
            <span className="gold-ring" aria-hidden="true" />
            <h2 className="text-center text-3xl">{plan.label}</h2>
            <dl className="mt-5 grid gap-x-6 gap-y-3 text-xl sm:grid-cols-2">
              <div>
                <dt className="gate-soft text-base">מה נשאר לך בתוכנית</dt>
                <dd>
                  {o.kind === "daily"
                    ? `${o.basketLeft ?? 0} צפיות או הורדות`
                    : o.endsAt
                      ? `נשאר לך למנוי עוד ${formatTimeLeft(o.endsAt)}`
                      : `${PLANS.substitute_3m.days! / 30} חודשים (מתחילים בהורדה הראשונה)`}
                </dd>
              </div>
              <div>
                <dt className="gate-soft text-base">שולם על התוכנית</dt>
                <dd><GateShekel agorot={o.paid} /></dd>
              </div>
              <div>
                <dt className="gate-soft text-base">מחיר המנוי השנתי</dt>
                <dd><GateShekel agorot={prices.plans.yearly} /></dd>
              </div>
              <div>
                <dt className="gate-soft text-base">לתשלום עכשיו</dt>
                <dd className="text-[#ffd45a]"><GateShekel agorot={o.diff} /></dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="gate-soft text-base">המנוי השנתי יסתיים</dt>
                <dd>{newEnd}</dd>
              </div>
            </dl>
            {o.kind === "daily" && (
              <p className="mt-3 text-center text-[#ffd45a]">
                הבחירה במקצוע (עד 3 מקצועות) תתבצע מיד אחרי השדרוג.
              </p>
            )}
            <form action={upgradeToYearlyAction} className="mt-6 text-center">
              <input type="hidden" name="purchaseId" value={o.rows[0].id} />
              <button type="submit" className="btn btn-gold btn-gate py-2">
                שדרוג למנוי שנתי
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
