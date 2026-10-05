import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CalendarRange,
  Crown,
  FileDown,
  Gift,
  Plus,
} from "lucide-react";
import {
  PLANS,
  YEARLY_INCLUDED_SUBJECTS,
  SUBSTITUTE_MONTHS,
} from "@/lib/constants";
import { getPlanPrices } from "@/lib/pricing";
import { getCurrentUser } from "@/lib/session";
import { getActivePurchases } from "@/lib/data";
import { GateShekel } from "@/components/gate-shekel";
import { AnimatedGrid } from "@/components/animated-grid";

export const metadata: Metadata = { title: "מסלולים ומחירים" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const prices = await getPlanPrices();
  const user = await getCurrentUser();
  const hasYearly = user
    ? (await getActivePurchases(user.id)).some((p) => p.plan === "yearly")
    : false;
  const arrow = (
    <ArrowLeft
      className="h-4 w-4 fix-gate-arrow"
      strokeWidth={1.75}
      aria-hidden
    />
  );
  // במקום סימן וי – תמונת אגוז
  const check = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/nut-check.png"
      alt=""
      aria-hidden
      className="h-8 w-auto shrink-0"
    />
  );

  // תמונת אגוזים מתחת לכרטיס המסלול (קישוט בלבד)
  const decor = (name: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/images/plan-nuts/${name}.png`}
      alt=""
      aria-hidden
      className="plan-nuts"
      style={{ height: name === "single" ? "5.5rem" : name === "daily" ? "6.5rem" : "8.5rem" }}
    />
  );

  // כל העמוד בעיצוב ההודעה "שימי לב!" שלפני תיקון החומרים: חלונית כחולה כהה עם ניצוץ זהב, כרטיסי זהב בהיר במסגרת שחורה
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logo-black.png"
          alt="לו״ז העניין"
          className="w-44 sm:w-52"
        />
        <div>
          <h1 className="text-4xl md:text-5xl">מסלולים ומחירים</h1>
          <p className="mt-2 max-w-md">
            מהיחידה הקטנה ביותר ועד מנוי שנתי. בחרי מה שמתאים
            למערכת השעות שלך.
          </p>
        </div>
      </div>

      {/* למי שכבר רכשה מנוי שנתי: כפתור לתוספת מקצוע (עדיין אין רכישה בסל – מוביל ל"צרי קשר") */}
      {hasYearly && (
        <div className="gate-panel mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="gold-ring" aria-hidden="true" />
          <p className="text-xl">
            יש לך מנוי שנתי פעיל. רוצה להוסיף מקצוע?{" "}
            <span className="text-[#ffd45a]">
              <GateShekel agorot={prices.yearlyExtraSubject} /> × 12 חודשים
            </span>
          </p>
          <Link href="/contact" className="btn btn-gold btn-gate py-2">
            <Plus className="h-4 w-4" aria-hidden /> תוספת מקצוע {arrow}
          </Link>
        </div>
      )}

      {/* המסלולים */}
      <section
        className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8"
        aria-labelledby="plans-h"
      >
        <span className="gold-ring" aria-hidden="true" />
        <h2 id="plans-h" className="text-center text-3xl">
          המסלולים
        </h2>
        <AnimatedGrid className="mt-6 grid gap-10">
                    <div className="gate-card gate-plan">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/seals/single.png" alt="כשאת צריכה דחוף שיעור." className="plan-seal" />
            <span className="gate-icon">
              <FileDown className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </span>
            <h3 className="mt-2 text-2xl">{PLANS.single.label}</h3>
            <p className="gate-soft">{PLANS.single.description}</p>
            <div className="gate-price gate-price-lg mt-2">
              <GateShekel agorot={prices.defaultSingle} />
            </div>
            <p>ליחידה</p>
            <hr className="gate-divider" />
            <ul className="mb-4 space-y-1 text-start">
              <li className="flex gap-2">{check} תשלום חד-פעמי</li>
              <li className="flex gap-2">{check} בלי התחייבות</li>
            </ul>
            <Link
              href="/subjects"
              className="btn btn-gold btn-gate mt-auto py-2"
            >
              לבחירת פרק {arrow}
            </Link>
            {decor("single")}
          </div>

                    <div className="gate-card gate-plan gate-plan-featured">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/seals/yearly.png" alt="כשאת צריכה הכנה מקסימלית למבחני הבגרות במינימום מאמץ" className="plan-seal" />
            <span className="gate-badge gate-ribbon">
              <Award className="inline h-5 w-5" aria-hidden /> הכי משתלם!
            </span>
            <span className="gate-icon">
              <Crown className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </span>
            <h3 className="mt-2 text-2xl">{PLANS.yearly.label}</h3>
            <p className="gate-soft">{PLANS.yearly.description}</p>
            <div className="gate-price gate-price-lg mt-2">
              <GateShekel agorot={prices.yearlyListMonthly} />
            </div>
            <p>לחודש × 12 חודשים</p>
            <p className="gate-soft text-base">
              סה״כ <GateShekel agorot={prices.yearlyListMonthly * 12} /> לשנה
            </p>
            <hr className="gate-divider" />
            <ul className="mb-4 space-y-1 text-start">
              <li className="flex gap-2">
                {check} מיועד עבור {YEARLY_INCLUDED_SUBJECTS} מקצועות
              </li>
              <li className="flex gap-2">
                {check}
                <span>
                  לכל מקצוע נוסף{" "}
                  <GateShekel agorot={prices.yearlyExtraSubject} /> × 12 חודשים
                </span>
              </li>
            </ul>
            <Link
              href="/checkout?plan=yearly"
              className="btn btn-gold btn-gate mt-auto py-2"
            >
              בחירת מסלול {arrow}
            </Link>
            {decor("yearly")}
          </div>
        </AnimatedGrid>

        {/* קישור לקופון ההשקה (עמוד "קופונים זמינים") */}
        <div className="gate-strip mt-10">
          <p className="text-xl">
            <Gift className="inline h-5 w-5" aria-hidden /> לרגל השקת האתר –
            מנוי שנתי במחיר היכרות:{" "}
            <GateShekel agorot={Math.round(prices.plans.yearly / 12)} /> לחודש
            במקום{" "}
            <s className="gate-old-price">
              <GateShekel agorot={prices.yearlyListMonthly} />
            </s>
          </p>
          <Link href="/coupons" className="btn btn-gold btn-gate py-2">
            לקופון {arrow}
          </Link>
        </div>
      </section>

      {/* ממלאת מקום? לחיצה על "כן" פותחת שני מסלולים נוספים (details מקורי – בלי JS) */}
      <div className="gate-panel mx-auto mt-8 max-w-2xl">
        <span className="gold-ring" aria-hidden="true" />
        <details className="gate-sub">
          <summary>
            <span className="text-3xl">ממלאת מקום?</span>
            <span className="btn btn-gold btn-gate py-2">כן {arrow}</span>
          </summary>
          <div className="mt-6 grid gap-10">
                      <div className="gate-card gate-plan">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/seals/substitute.png" alt="כשאת ממלאת מקום ולא מוותרת על הכנה מושלמת למבחני הבגרות!" className="plan-seal" />
              <span className="gate-icon">
                <CalendarRange
                  className="h-6 w-6"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </span>
              <h3 className="mt-2 text-2xl">
                ממלאת מקום {SUBSTITUTE_MONTHS} חודשים
              </h3>
              <p className="gate-soft">מנוי ל-{SUBSTITUTE_MONTHS} חודשים</p>
              <div className="gate-price gate-price-lg mt-2">
                <GateShekel agorot={prices.substituteMonthly} />
              </div>
              <p>לחודש × {SUBSTITUTE_MONTHS} חודשים</p>
              <p className="gate-soft text-base">
                סה״כ{" "}
                <GateShekel
                  agorot={prices.substituteMonthly * SUBSTITUTE_MONTHS}
                />
              </p>
              <hr className="gate-divider" />
              <ul className="mb-4 space-y-1 text-start">
                <li className="flex gap-2">
                  {check} {YEARLY_INCLUDED_SUBJECTS} מקצועות
                </li>
                <li
                  className="flex cursor-help gap-2"
                  tabIndex={0}
                  data-tip={`אם תצטרכי חודש נוסף תוכלי לשלם עבורו ${prices.substituteLaunchMonthly / 100} ש"ח כמו ששלמת על החודשים הקודמים.`}
                >
                  {check} אפשרות הארכה לחודש נוסף במחיר הטבת המסלול
                </li>
              </ul>
              <div className="gate-strip gate-strip-dark mt-auto">
                <p>
                  <Gift className="inline h-5 w-5" aria-hidden /> לרגל השקת
                  האתר: <GateShekel agorot={prices.substituteLaunchMonthly} />{" "}
                  לחודש × {SUBSTITUTE_MONTHS} חודשים
                </p>
                <Link href="/coupons" className="btn btn-gold btn-gate py-2">
                  לקופון {arrow}
                </Link>
              </div>
              {decor("substitute")}
            </div>

                      <div className="gate-card gate-plan">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/seals/daily.png" alt="כשאת צריכה לשלוף מהכובע כל יום שיעור במקצוע אחר" className="plan-seal" />
              <span className="gate-icon">
                <CalendarDays
                  className="h-6 w-6"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </span>
              <h3 className="mt-2 text-2xl">ממלאת מקום יומית</h3>
              <p className="gate-soft">סל הורדות</p>
              <div className="gate-price gate-price-lg mt-2">
                <GateShekel agorot={prices.substituteDaily} />
              </div>
              <p>עבור {prices.substituteDailyDownloads} צפיות או הורדות</p>
              <p className="gate-soft text-base">
                לשימוש מתי שצריך, בלי הגבלת זמן
              </p>
              <hr className="gate-divider" />
              <div className="gate-strip gate-strip-dark mt-auto">
                <p>
                  <Gift className="inline h-5 w-5" aria-hidden /> עכשיו במבצע:{" "}
                  <GateShekel agorot={prices.substituteDailyLaunch} />
                </p>
                <Link href="/coupons" className="btn btn-gold btn-gate py-2">
                  לקופון {arrow}
                </Link>
              </div>
              {decor("daily")}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
