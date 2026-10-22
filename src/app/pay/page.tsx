import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getRootSubjects } from "@/lib/data";
import { getPlanPrices } from "@/lib/pricing";
import { getBestPercentCoupon } from "@/lib/private-coupons";
import { hasActiveSamePlan } from "@/lib/purchase-helpers";
import { PLANS, SUBJECT_ICONS, SUBSTITUTE_MONTHS, subjectDisplayTitle } from "@/lib/constants";
import { loadNedarimConfig } from "@/lib/nedarim/config";
import { PAYABLE_PLANS, isPayablePlan, isValidReference, type PayablePlan } from "@/lib/nedarim/logic";
import { PayClient, type PayPlanOption } from "@/components/pay/pay-client";

/*
 * /pay – דף התשלום והפעלת המנוי דרך נדרים פלוס (מחוברות בלבד; מי שלא נרשמה מופנית להרשמה וחוזרת לכאן).
 * ?plan=yearly|substitute_3m|substitute_daily  ?categories=1,2 (או ?category=1)  ?ref=NP-… (המתנה/סטטוס של בקשה קיימת –
 * גם כתובת החזרה מדף התשלום של נדרים). שלבים (בצד הלקוח): מסלול → מקצועות + פרטים חסרים → הפניה לדף התשלום המתארח של
 * נדרים + המתנה לזיהוי התשלום → סיום. docs/nedarim-payments.md
 */
export const metadata: Metadata = { title: "תשלום והפעלת מנוי" };
export const dynamic = "force-dynamic";

type SP = { plan?: string; categories?: string; category?: string; ref?: string };

function num(v?: string) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export default async function PayPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  const here = `/pay${qs ? `?${qs}` : ""}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const cfg = await loadNedarimConfig();
  if (!cfg.enabled) {
    // התשלום דרך נדרים כבוי – הקופה הישנה (רישום מיידי) עדיין עובדת
    const plan = isPayablePlan(sp.plan) ? sp.plan : "yearly";
    redirect(`/checkout?plan=${plan}${sp.categories ? `&categories=${encodeURIComponent(sp.categories)}` : ""}`);
  }

  // כבר יש מנוי פעיל מאותו מסלול (ובלי ?ref – ה-ref הוא חזרה מהתשלום/המתנה לבקשה קיימת) – לא מציגות תשלום כפול
  if (isPayablePlan(sp.plan) && !isValidReference(sp.ref) && (await hasActiveSamePlan(user.id, sp.plan))) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <section className="gate-panel mx-auto mt-8 max-w-2xl text-center sm:!p-8">
          <span className="gold-ring" aria-hidden="true" />
          <div className="gate-card">
            <h1 className="mt-2 text-3xl">כבר יש לך מנוי פעיל במסלול הזה</h1>
            <p className="gate-soft mt-2 text-lg">אין צורך לשלם שוב. אפשר לראות את המנוי באזור האישי, או לבחור מסלול אחר.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/account" className="btn btn-gold btn-gate py-2">
                לאזור האישי
              </Link>
              <Link href="/pricing" className="btn gate-skip py-2">
                למסלולים ומחירים
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const [prices, roots, coupon] = await Promise.all([getPlanPrices(), getRootSubjects(), getBestPercentCoupon(user)]);
  const subjects = roots.map((r) => ({
    id: r.id,
    title: subjectDisplayTitle(r.slug, r.title),
    slug: r.slug,
    icon: r.icon ?? SUBJECT_ICONS[r.slug] ?? "📘",
  }));
  const plans: PayPlanOption[] = PAYABLE_PLANS.map((key) => ({
    key,
    label: PLANS[key].label,
    description: PLANS[key].description,
    price: prices.plans[key],
    downloadsLimit: PLANS[key].downloadsLimit ?? null,
    days: PLANS[key].days ?? null,
  }));
  const initialPlan: PayablePlan | null = isPayablePlan(sp.plan) ? sp.plan : null;
  const catId = num(sp.category);
  const preselected = (sp.categories ?? "")
    .split(",")
    .map((x) => num(x.trim()))
    .concat(catId ? [catId] : [])
    .filter((x): x is number => !!x && subjects.some((s) => s.id === x));

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
        <div>
          <h1 className="text-4xl md:text-5xl">תשלום והפעלת מנוי</h1>
          <p className="mt-2 max-w-md">
            שלום {user.name.split(" ")[0]}, בחרי מסלול, אשרי את הפרטים ושלמי בדף המאובטח של נדרים פלוס – המנוי ייפתח
            אוטומטית כשהתשלום יזוהה.
          </p>
        </div>
      </div>

      {!cfg.ready ? (
        <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8">
          <span className="gold-ring" aria-hidden="true" />
          <div className="gate-card">
            <h2 className="text-2xl">התשלום באתר עדיין לא הופעל</h2>
            <p className="gate-soft mt-2">
              חיבור הסליקה נמצא בהשלמה. אפשר לפנות אלינו ונפעיל לך את המנוי ידנית.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/contact?topic=subscription" className="btn btn-gold">
                צור קשר
              </Link>
              <Link href="/pricing" className="btn btn-ghost">
                למסלולים ומחירים
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <PayClient
          plans={plans}
          initialPlan={initialPlan}
          subjects={subjects}
          preselected={preselected}
          needsPhone={!user.phone}
          needsLocation={!user.city || !user.school}
          user={{ firstName: user.name.split(" ")[0], fullName: user.name, email: user.email, phone: user.phone, personalCode: user.personalCode }}
          coupon={coupon && coupon.percent ? { label: coupon.label, percent: coupon.percent } : null}
          initialRef={isValidReference(sp.ref) ? sp.ref : null}
          substituteMonths={SUBSTITUTE_MONTHS}
          substituteDailyDownloads={prices.substituteDailyDownloads}
          yearlyListMonthly={prices.yearlyListMonthly}
          substituteMonthly={prices.substituteMonthly}
        />
      )}
    </div>
  );
}
