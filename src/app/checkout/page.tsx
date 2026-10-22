import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { ShoppingBag, FolderOpen, CalendarDays, ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { categories, materials } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getCategoryChain, chainToHref, getDescendantIds, getRootSubjects } from "@/lib/data";
import {
  PLANS,
  MATERIAL_KINDS,
  SUBJECT_ICONS,
  bundlePriceFor,
  formatPrice,
  isRetiredPlan,
  subjectDisplayTitle,
} from "@/lib/constants";
import { PlanCheckoutView } from "@/components/plan-checkout";
import { getPlanPrices } from "@/lib/pricing";
import { getBool } from "@/lib/settings";
import { getBestPercentCoupon } from "@/lib/private-coupons";
import { GateShekel } from "@/components/gate-shekel";
import { CheckoutForm, type CheckoutFormProps, type CheckoutSubject } from "@/components/checkout-form";

export const metadata: Metadata = { title: "השלמת הזמנה" };
export const dynamic = "force-dynamic";

type SP = {
  material?: string;
  bundle?: string;
  plan?: string;
  category?: string;
  categories?: string;
};

function num(v?: string) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function Crumbs({ chain }: { chain: { id: number; title: string }[] }) {
  return (
    <p className="gate-soft text-base flex flex-wrap items-center gap-1">
      {chain.map((c, i) => (
        <span key={c.id} className="flex items-center gap-1">
          {i > 0 && <ChevronLeft className="h-3 w-3" />}
          {c.title}
        </span>
      ))}
    </p>
  );
}

function CheckoutMessage({
  title,
  text,
  primary,
  secondary,
}: {
  title: string;
  text: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <section className="gate-panel mx-auto mt-8 max-w-2xl text-center sm:!p-8">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-card">
          <span className="gate-icon mx-auto">
            <ShoppingBag className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </span>
          <h1 className="mt-2 text-3xl">{title}</h1>
          <p className="gate-soft mt-2 text-lg">{text}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href={primary.href} className="btn btn-gold btn-gate py-2">
              {primary.label}
            </Link>
            <Link href={secondary.href} className="btn gate-skip py-2">
              {secondary.label}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"),
  ).toString();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout${qs ? `?${qs}` : ""}`)}`);

  const prices = await getPlanPrices();

  let heading = "";
  let summary: ReactNode = null;
  let formProps: CheckoutFormProps | null = null;
  let subjects: CheckoutSubject[] = [];

  const loadSubjects = async () => {
    const roots = await getRootSubjects();
    subjects = roots.map((r) => ({
      id: r.id,
      title: subjectDisplayTitle(r.slug, r.title),
      slug: r.slug,
      icon: r.icon ?? SUBJECT_ICONS[r.slug] ?? "📘",
    }));
  };

  const materialId = num(sp.material);
  const bundleId = num(sp.bundle);
  const planKey = sp.plan;

  // תשלום אמיתי דרך נדרים פלוס דולק → הורדה בודדת / קובץ מורחב נרכשים ב-/pay (הקופה המדומה כאן נשארת רק כשהוא כבוי)
  if ((materialId || bundleId) && (await getBool("nedarim_enabled"))) {
    redirect(materialId ? `/pay?material=${materialId}` : `/pay?bundle=${bundleId}`);
  }

  if (materialId) {
    const [m] = await db.select().from(materials).where(eq(materials.id, materialId)).limit(1);
    if (!m) redirect("/subjects");
    const chain = await getCategoryChain(m.categoryId);
    heading = "הורדה בודדת";
    summary = (
      <div className="flex gap-4">
        <span className="gate-icon shrink-0 text-2xl">{MATERIAL_KINDS[m.kind].icon}</span>
        <div className="min-w-0">
          <Crumbs chain={chain} />
          <h2 className="mt-1 text-2xl leading-snug">{m.title}</h2>
          <p className="gate-soft text-base">{MATERIAL_KINDS[m.kind].label}</p>
          <Link href={chainToHref(chain)} className="text-base underline">
            חזרה לפרק
          </Link>
        </div>
        <span className="gate-price ms-auto whitespace-nowrap">
          <GateShekel agorot={m.price} />
        </span>
      </div>
    );
    formProps = { kind: "single", materialId: m.id, basePrice: m.price };
  } else if (bundleId) {
    const [c] = await db.select().from(categories).where(eq(categories.id, bundleId)).limit(1);
    if (!c) redirect("/subjects");
    const chain = await getCategoryChain(c.id);
    const ids = await getDescendantIds(c.id);
    const ms = ids.length
      ? await db.select({ price: materials.price }).from(materials).where(inArray(materials.categoryId, ids))
      : [];
    const price = bundlePriceFor({ bundlePrice: c.bundlePrice, isLeaf: ids.length <= 1, materialsTotal: ms.reduce((s, x) => s + x.price, 0) });
    heading = "קובץ מורחב – תיקייה שלמה";
    summary = (
      <div className="flex gap-4">
        <span className="gate-icon shrink-0">
          <FolderOpen className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <Crumbs chain={chain.slice(0, -1)} />
          <h2 className="mt-1 text-2xl leading-snug">{c.title}</h2>
          <p className="gate-soft text-base">
            {ms.length} חומרים בתיקייה ובכל תתי-הפרקים שלה
            {!c.bundlePrice && ids.length > 1 && ms.length > 0 && " · 30% הנחה לעומת רכישה בודדת"}
          </p>
          <Link href={chainToHref(chain)} className="text-base underline">
            חזרה לתיקייה
          </Link>
        </div>
        <span className="gate-price ms-auto whitespace-nowrap">
          <GateShekel agorot={price} />
        </span>
      </div>
    );
    formProps = { kind: "bundle", categoryId: c.id, basePrice: price };
  } else if (planKey && isRetiredPlan(planKey)) {
    // מסלול חודשי ישן (subject_monthly / custom_monthly) – הוסר מהמכירה; קישורים ישנים מגיעים לכאן
    return (
      <CheckoutMessage
        title="המסלול הזה כבר לא קיים"
        text="המסלולים החודשיים הישנים הוחלפו במסלולים המעודכנים – בחרי מסלול בעמוד המסלולים."
        primary={{ href: "/pricing", label: "למסלולים ומחירים" }}
        secondary={{ href: "/subjects", label: "למקצועות" }}
      />
    );
  } else if (planKey === "yearly" || planKey === "substitute_3m" || planKey === "substitute_daily") {
    // תשלום אמיתי דרך נדרים פלוס דולק → מסלולי המנוי נרכשים ב-/pay (הקופה המדומה כאן נשארת רק כשהוא כבוי)
    if (await getBool("nedarim_enabled")) {
      const q = new URLSearchParams({ plan: planKey });
      if (sp.categories) q.set("categories", sp.categories);
      if (sp.category) q.set("category", sp.category);
      redirect(`/pay?${q.toString()}`);
    }
    const def = PLANS[planKey];
    const planPrice = prices.plans[planKey];
    const days = def.days ?? 30;
    await loadSubjects();
    // בחירה מראש של מקצועות: ?categories=1,2 (או ?category=1 בודד) – רק למסלולים שבוחרים בהם מקצוע
    const catId = num(sp.category);
    const pre =
      planKey === "substitute_daily"
        ? []
        : (sp.categories ?? "")
            .split(",")
            .map((x) => num(x.trim()))
            .concat(catId ? [catId] : [])
            .filter((x): x is number => !!x && subjects.some((s) => s.id === x));
    heading = def.label;
    summary = (
      <div className="flex gap-4">
        <span className="grid place-items-center h-14 w-14 rounded-2xl bg-pink-soft text-pink shrink-0">
          <CalendarDays className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-lg leading-snug">{def.label}</h2>
          <p className="text-sm text-muted">{def.description}</p>
          <p className="text-xs text-muted mt-1">
            תוקף: {days} ימים · גישה מלאה לכל החומרים בתחום המסלול
          </p>
        </div>
        <span className="ms-auto text-left whitespace-nowrap">
          <span className="font-display font-bold text-xl text-blue-deep block">
            {formatPrice(planPrice)}
          </span>
          {planKey === "yearly" && (
            <span className="text-xs text-muted">
              ({formatPrice(Math.round(planPrice / 12))} לחודש · 12 תשלומים · חיוב אחד)
            </span>
          )}
        </span>
      </div>
    );
    formProps = {
      kind: "plan",
      plan: planKey,
      subjects,
      preselected: pre,
      basePrice: planPrice,
    };
  }

  if (!formProps) {
    return (
      <CheckoutMessage
        title="הסל ריק"
        text="בחרי חומר, תיקייה או מסלול כדי להמשיך."
        primary={{ href: "/subjects", label: "למקצועות" }}
        secondary={{ href: "/pricing", label: "למסלולים" }}
      />
    );
  }

  // רכישה ראשונה: חסרים עיר מגורים ושם תיכון (לא נשאלים בהרשמה)
  formProps.needsLocation = !user.city || !user.school;

  // קופון הנחה פרטי של המשתמשת (אם יש) – יורד אוטומטית מהסכום בעת האישור
  const coupon = await getBestPercentCoupon(user);
  const couponBanner = coupon ? (
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
      <div className="gate-panel mx-auto max-w-2xl !p-3">
        <div className="gate-strip text-base">
          🎟️ יש לך קופון «{coupon.label}» – {coupon.percent}% הנחה יורדים אוטומטית מסכום ההזמנה בעת האישור.
        </div>
      </div>
    </div>
  ) : null;

  // מסלולי מנוי – באותו עיצוב של עמוד "מסלולים ומחירים"
  if (formProps.kind === "plan" && formProps.plan) {
    return (
      <>
        {couponBanner}
        <PlanCheckoutView
          formProps={formProps}
          prices={prices}
          firstName={user.name.split(" ")[0]}
          fullName={user.name}
          email={user.email}
          phone={user.phone}
          personalCode={user.personalCode}
        />
      </>
    );
  }
  return (
    <>
    {couponBanner}
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
        <div>
          <h1 className="text-4xl md:text-5xl">{heading}</h1>
          <p className="mt-2 max-w-md">שלום {user.name.split(" ")[0]}, בדקי את פרטי ההזמנה ואשרי.</p>
        </div>
      </div>

      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-label="סיכום הזמנה">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-card">
          {summary}
          <hr className="gate-divider" />
          <p className="text-base leading-loose !text-[#6b3f1d]">
            כל קובץ שתורידי יוטבע במספר האישי שלך (<b dir="ltr">{user.personalCode}</b>) – כך אנחנו שומרים על זכויות היוצרים של הכותבות.
          </p>
        </div>
        <CheckoutForm {...formProps} gate />
      </section>
    </div>
    </>
  );
}
