import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Gift, Ticket } from "lucide-react";
import {
  PLANS,
  SUBSTITUTE_MONTHS,
} from "@/lib/constants";
import { getPlanPrices } from "@/lib/pricing";
import { GateShekel } from "@/components/gate-shekel";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { benefitText, getActiveCouponsFor, parseSubjectIds } from "@/lib/private-coupons";
import { redeemSubjectsCouponAction } from "@/lib/actions/private-coupons";
import { ClaimCouponForm } from "@/components/claim-coupon-form";

export const metadata: Metadata = { title: "קופונים זמינים" };
export const dynamic = "force-dynamic";

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const sp = await searchParams;
  const prices = await getPlanPrices();
  const user = await getCurrentUser();
  const linkCode = typeof sp.code === "string" ? sp.code.slice(0, 40) : undefined;
  if (!user && linkCode) redirect(`/login?next=${encodeURIComponent(`/coupons?code=${linkCode}`)}`);

  // קופונים פרטיים של המשתמשת (לפי המייל שלה / קוד שהפעילה) – לא מופיעים לאף אחת אחרת
  const mine = user ? await getActiveCouponsFor(user) : [];
  const subjectIds = [...new Set(mine.flatMap((c) => parseSubjectIds(c)))];
  const subjectRows = subjectIds.length
    ? await db.select({ id: categories.id, title: categories.title }).from(categories).where(inArray(categories.id, subjectIds))
    : [];
  const titleOf = new Map(subjectRows.map((r) => [r.id, r.title]));

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20">
      <div className="gate-title animate-fade-up text-center">
        <h1 className="text-4xl md:text-5xl">קופונים זמינים</h1>
        <p className="mt-2">הנהלת האתר רשאית לבטל בכל עת את הקופונים.</p>
      </div>

      {/* קופונים אישיים – מופיעים רק למי שהמנהלת שייכה לה אותם */}
      {user && (mine.length > 0 || linkCode) && (
        <section className="gate-panel mt-8 animate-fade-up" aria-labelledby="mine-h">
          <span className="gold-ring" aria-hidden="true" />
          <p id="mine-h" className="text-center text-xl text-[#ffd45a]">
            <Gift className="inline h-5 w-5" aria-hidden /> הקופונים האישיים שלך
          </p>
          {mine.map((c) => (
            <div key={c.id} className="coupon gate-card mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-black.png" alt="" className="coupon-logo" />
              <div className="coupon-main">
                <span className="gate-badge">
                  <Ticket className="inline h-3.5 w-3.5" aria-hidden /> קופון אישי
                </span>
                <h2 className="mt-2 text-2xl">{c.label}</h2>
                <p className="gate-soft text-base">
                  {benefitText(c, parseSubjectIds(c).map((id) => titleOf.get(id) ?? ""))}
                  {c.expiresAt && <> · בתוקף עד {c.expiresAt.toLocaleDateString("he-IL")}</>}
                </p>
              </div>
              <div className="coupon-stub">
                {c.benefit === "percent" ? (
                  <Link href="/pricing" className="btn btn-gold btn-gate py-2">
                    לבחירת מסלול <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
                  </Link>
                ) : (
                  <form action={redeemSubjectsCouponAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn btn-gold btn-gate py-2">מימוש עכשיו</button>
                  </form>
                )}
              </div>
            </div>
          ))}
          {mine.some((c) => c.benefit === "percent") && (
            <p className="gate-soft text-center text-sm mt-3">קופון ההנחה יורד אוטומטית בתשלום הבא שלך.</p>
          )}
          <div className="mt-4">
            <p className="gate-soft text-center text-sm mb-2">יש לך קוד קופון?</p>
            <ClaimCouponForm defaultCode={linkCode} />
          </div>
        </section>
      )}

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
