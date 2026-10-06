import { Check, CalendarDays, Crown } from "lucide-react";
import { PLANS, SUBSTITUTE_MONTHS, YEARLY_INCLUDED_SUBJECTS } from "@/lib/constants";
import type { PlanPrices } from "@/lib/pricing";
import { GateShekel } from "@/components/gate-shekel";
import { CheckoutForm, type CheckoutFormProps } from "@/components/checkout-form";

/** עמוד רכישת מנוי – באותו עיצוב של עמוד "מסלולים ומחירים" (חלונית כחולה, כרטיסי זהב) */
export function PlanCheckoutView({
  formProps,
  prices,
  firstName,
  fullName,
  email,
  phone,
  personalCode,
}: {
  formProps: CheckoutFormProps;
  prices: PlanPrices;
  firstName: string;
  fullName: string;
  email: string;
  phone?: string | null;
  personalCode: string;
}) {
  const plan = formProps.plan ?? "yearly";
  const def = PLANS[plan];
  const isYearly = plan === "yearly";
  const isSub3 = plan === "substitute_3m";
  const isDaily = plan === "substitute_daily";
  const expandable = isYearly || isSub3;
  const check = <Check className="mt-1 h-4 w-4 shrink-0" aria-hidden />;
  const showList = isYearly && formProps.basePrice / 12 < prices.yearlyListMonthly;
  const subMonthly = Math.round(formProps.basePrice / SUBSTITUTE_MONTHS);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
        <div>
          <h1 className="text-4xl md:text-5xl">השלמת הרשמה</h1>
          <p className="mt-2 max-w-md">
            {isDaily
              ? `שלום ${firstName}, בדקי את פרטי ההזמנה ואשרי.`
              : `שלום ${firstName}, בחרי את המקצוע (או המקצועות) שלך ואשרי את ההזמנה.`}
          </p>
        </div>
      </div>

      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby="order-h">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-card gate-plan gate-plan-featured">
          <span className="gate-icon">
            {isYearly ? (
              <Crown className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            ) : (
              <CalendarDays className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            )}
          </span>
          <h2 id="order-h" className="mt-2 text-2xl">{def.label}</h2>
          <p className="gate-soft">{def.description}</p>
          {isYearly ? (
            <>
              <div className="gate-price gate-price-lg mt-2">
                <GateShekel agorot={Math.round(formProps.basePrice / 12)} />
                {showList && (
                  <>
                    {" "}
                    <s className="gate-old-price text-[0.6em]">
                      <GateShekel agorot={prices.yearlyListMonthly} />
                    </s>
                  </>
                )}
              </div>
              <p>לחודש × 12 חודשים</p>
              <p className="gate-soft text-base">
                סה״כ <GateShekel agorot={formProps.basePrice} /> לשנה
              </p>
            </>
          ) : isSub3 ? (
            <>
              <div className="gate-price gate-price-lg mt-2">
                <GateShekel agorot={subMonthly} />{" "}
                {subMonthly < prices.substituteMonthly && (
                  <s className="gate-old-price text-[0.6em]">
                    <GateShekel agorot={prices.substituteMonthly} />
                  </s>
                )}
              </div>
              <p>לחודש × {SUBSTITUTE_MONTHS} חודשים</p>
              <p className="gate-soft text-base">
                סה״כ <GateShekel agorot={formProps.basePrice} />
              </p>
            </>
          ) : (
            <>
              <div className="gate-price gate-price-lg mt-2">
                <GateShekel agorot={formProps.basePrice} />
              </div>
              <p>עבור {prices.substituteDailyDownloads} צפיות או הורדות</p>
              <p className="gate-soft text-base">לשימוש מתי שצריך, בלי הגבלת זמן</p>
            </>
          )}
          <hr className="gate-divider" />
          <ul className="space-y-1 text-start">
            {expandable && (
              <>
                <li className="flex gap-2">
                  {check}{" "}
                  {isSub3 ? "מקצוע אחד" : "מנוי למקצוע"} – ואפשר להרחיב עד {YEARLY_INCLUDED_SUBJECTS} מקצועות באותו מחיר
                </li>
                <li className="flex gap-2">
                  {check}
                  <span>
                    אפשר להתחיל במקצוע אחד ולהוסיף עוד {isSub3 ? "בכל שלב" : "במהלך השנה"} – המקצוע הנוסף יסתיים יחד עם המנוי
                  </span>
                </li>
                <li className="flex gap-2">
                  {check}
                  <span>התקופה מתחילה מההורדה הראשונה, לא ממועד הרכישה</span>
                </li>
              </>
            )}
            {isDaily && (
              <li className="flex gap-2">
                {check}
                <span>אפשר לשדרג בכל שלב למנוי שנתי – תשלמי רק את ההפרש</span>
              </li>
            )}
          </ul>
          <p className="mt-3 text-start text-sm leading-snug !text-gray-500">
            כל קובץ שתורידי יוטבע בשמך (<b>{fullName}</b>), בכתובת המייל שלך (<b dir="ltr">{email}</b>),
            {phone ? <> במספר הטלפון שלך (<b dir="ltr">{phone}</b>) </> : " במספר הטלפון שלך "}
            ובמספר האישי שלך (<b dir="ltr">{personalCode}</b>) – כך אנחנו שומרים על זכויות היוצרים של הכותבות.
          </p>
        </div>

        <CheckoutForm {...formProps} gate />
      </section>
    </div>
  );
}
