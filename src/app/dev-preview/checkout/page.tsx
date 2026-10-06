import { notFound } from "next/navigation";
import { PlanCheckoutView } from "@/components/plan-checkout";
import { getPlanPrices } from "@/lib/pricing";
import type { CheckoutFormProps } from "@/components/checkout-form";

export const dynamic = "force-dynamic";

/** הדמיה לפיתוח בלבד: עמוד רכישת מנוי בלי התחברות (לא נגיש ב-production). ?plan=yearly|substitute_3m|substitute_daily */
export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const plan = sp.plan === "substitute_3m" || sp.plan === "substitute_daily" ? sp.plan : "yearly";
  const prices = await getPlanPrices();
  const subjects = [
    ["📜", "תורה", "torah"], ["🕊️", "נביא", "navi"], ["🎼", "כתובים", "ktuvim"], ["✒️", "לשון – מערכת הצורות", "lashon-tzurot"],
    ["✒️", "לשון – תחביר", "lashon-tachbir"], ["✒️", "לשון – הבעה והבנה", "lashon-havaa"], ["📖", "ספרות", "sifrut"],
    ["🔤", "אנגלית", "english"], ["🕯️", "יהדות", "yahadut"],
  ].map(([icon, title, slug], i) => ({ id: i + 1, icon, title, slug }));
  const formProps: CheckoutFormProps = {
    kind: "plan",
    plan,
    subjects,
    preselected: [],
    basePrice: prices.plans[plan],
  };
  return <PlanCheckoutView formProps={formProps} prices={prices} firstName="דוגמה" fullName="דוגמה כהן" email="example@gmail.com" phone="050-0000000" personalCode="BG-0000" />;
}
