import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Gift, Ticket } from "lucide-react";
import {
  PLANS,
  SUBSTITUTE_MONTHS,
} from "@/lib/constants";
import { getPlanPrices } from "@/lib/pricing";
import { GateShekel } from "@/components/gate-shekel";

export const metadata: Metadata = { title: "קופונים זמינים" };
export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const prices = await getPlanPrices();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20">
      <div className="gate-title animate-fade-up text-center">
        <h1 className="text-4xl md:text-5xl">קופונים זמינים</h1>
        <p className="mt-2">הנהלת האתר רשאית לבטל בכל עת את הקופונים.</p>
      </div>

      {/* קופון ההשקה: מנוי שנתי במחיר היכרות – באותו עיצוב של "מסלולים ומחירים" */}
      <section className="gate-panel mt-8 animate-fade-up" aria-labelledby="launch-h">
        <span className="gold-ring" aria-hidden="true" />
        <p className="text-center text-xl text-[#ffd45a]">
          <Gift className="inline h-5 w-5" aria-hidden /> לרגל השקת האתר
        </p>
        <div className="coupon gate-card mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-black.png" alt="לו״ז העניין" className="coupon-logo" />
          <div className="coupon-main">
            <span className="gate-badge">
              <Ticket className="inline h-3.5 w-3.5" aria-hidden /> מחיר היכרות
            </span>
            <h2 id="launch-h" className="mt-2 text-2xl">
              {PLANS.yearly.label}
            </h2>
            <div className="gate-price coupon-price mt-1">
              <GateShekel agorot={Math.round(prices.plans.yearly / 12)} />{" "}
              <s className="gate-old-price"><GateShekel agorot={prices.yearlyListMonthly} /></s>
              <span className="text-xl"> לחודש × 12 חודשים</span>
            </div>
            <p className="gate-soft text-base">
              סה״כ <GateShekel agorot={prices.plans.yearly} /> לשנה.
            </p>
            <p className="mt-2 text-xl">בואי ותהני ממחיר היכרות שלא יחזור!</p>
          </div>
          <div className="coupon-stub">
            <Link href="/checkout?plan=yearly" className="btn btn-gold btn-gate py-2">
              למימוש <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
            </Link>
          </div>
        </div>

        {/* קופון ההשקה לממלאות מקום */}
        <div className="coupon gate-card mt-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-black.png" alt="" className="coupon-logo" />
          <div className="coupon-main">
            <span className="gate-badge">
              <Ticket className="inline h-3.5 w-3.5" aria-hidden /> מחיר היכרות
            </span>
            <h2 className="mt-2 text-2xl">ממלאת מקום {SUBSTITUTE_MONTHS} חודשים</h2>
            <div className="gate-price coupon-price mt-1">
              <GateShekel agorot={prices.substituteLaunchMonthly} />{" "}
              <s className="gate-old-price"><GateShekel agorot={prices.substituteMonthly} /></s>
              <span className="text-xl"> לחודש × {SUBSTITUTE_MONTHS} חודשים</span>
            </div>
            <p className="gate-soft text-base">
              סה״כ <GateShekel agorot={prices.substituteLaunchMonthly * SUBSTITUTE_MONTHS} />.
            </p>
          </div>
          <div className="coupon-stub">
            <Link href="/pricing" className="btn btn-gold btn-gate py-2">
              למסלול <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
            </Link>
          </div>
        </div>

        <div className="coupon gate-card mt-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-black.png" alt="" className="coupon-logo" />
          <div className="coupon-main">
            <span className="gate-badge">
              <Ticket className="inline h-3.5 w-3.5" aria-hidden /> מבצע
            </span>
            <h2 className="mt-2 text-2xl">ממלאת מקום יומית</h2>
            <div className="gate-price coupon-price mt-1">
              <GateShekel agorot={prices.substituteDailyLaunch} />{" "}
              <s className="gate-old-price"><GateShekel agorot={prices.substituteDaily} /></s>
            </div>
            <p className="gate-soft text-base">
              עבור {prices.substituteDailyDownloads} צפיות או הורדות, לשימוש מתי שצריך – בלי הגבלת זמן.
            </p>
          </div>
          <div className="coupon-stub">
            <Link href="/pricing" className="btn btn-gold btn-gate py-2">
              למסלול <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
