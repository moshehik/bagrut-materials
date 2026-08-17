import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { ShoppingBag, FileText, FolderOpen, CalendarDays, Sparkles, ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { categories, materials } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getCategoryChain, chainToHref, getDescendantIds, getRootSubjects } from "@/lib/data";
import { PLANS, PREMIUM_ADDON_PRICE, MATERIAL_KINDS, SUBJECT_ICONS, formatPrice } from "@/lib/constants";
import { CheckoutForm, type CheckoutFormProps, type CheckoutSubject } from "@/components/checkout-form";

export const metadata: Metadata = { title: "השלמת הזמנה" };
export const dynamic = "force-dynamic";

type SP = {
  material?: string;
  bundle?: string;
  plan?: string;
  category?: string;
  categories?: string;
  premium?: string;
};

function num(v?: string) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function Crumbs({ chain }: { chain: { id: number; title: string }[] }) {
  return (
    <p className="text-xs text-muted flex flex-wrap items-center gap-1">
      {chain.map((c, i) => (
        <span key={c.id} className="flex items-center gap-1">
          {i > 0 && <ChevronLeft className="h-3 w-3" />}
          {c.title}
        </span>
      ))}
    </p>
  );
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"),
  ).toString();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout${qs ? `?${qs}` : ""}`)}`);

  const premiumDefault = sp.premium === "1" || sp.premium === "on";

  let heading = "";
  let summary: ReactNode = null;
  let formProps: CheckoutFormProps | null = null;
  let subjects: CheckoutSubject[] = [];

  const loadSubjects = async () => {
    const roots = await getRootSubjects();
    subjects = roots.map((r) => ({
      id: r.id,
      title: r.title,
      icon: r.icon ?? SUBJECT_ICONS[r.slug] ?? "📘",
    }));
  };

  const materialId = num(sp.material);
  const bundleId = num(sp.bundle);
  const planKey = sp.plan;

  if (materialId) {
    const [m] = await db.select().from(materials).where(eq(materials.id, materialId)).limit(1);
    if (!m) redirect("/subjects");
    const chain = await getCategoryChain(m.categoryId);
    heading = "הורדה בודדת";
    summary = (
      <div className="flex gap-4">
        <span className="grid place-items-center h-14 w-14 rounded-2xl bg-blue-soft text-blue-deep shrink-0 text-2xl">
          {MATERIAL_KINDS[m.kind].icon}
        </span>
        <div className="min-w-0">
          <Crumbs chain={chain} />
          <h2 className="font-bold text-lg leading-snug mt-1">{m.title}</h2>
          <p className="text-sm text-muted">{MATERIAL_KINDS[m.kind].label}</p>
          <Link href={chainToHref(chain)} className="text-xs text-blue-deep hover:underline">
            חזרה לפרק
          </Link>
        </div>
        <span className="ms-auto font-display font-bold text-xl text-blue-deep whitespace-nowrap">
          {formatPrice(m.price)}
        </span>
      </div>
    );
    formProps = { kind: "single", materialId: m.id, basePrice: m.price, months: 1, premiumDefault };
  } else if (bundleId) {
    const [c] = await db.select().from(categories).where(eq(categories.id, bundleId)).limit(1);
    if (!c) redirect("/subjects");
    const chain = await getCategoryChain(c.id);
    const ids = await getDescendantIds(c.id);
    const ms = ids.length
      ? await db.select({ price: materials.price }).from(materials).where(inArray(materials.categoryId, ids))
      : [];
    const price = c.bundlePrice ?? Math.round(ms.reduce((s, x) => s + x.price, 0) * 0.7);
    heading = "קובץ מורחב – תיקייה שלמה";
    summary = (
      <div className="flex gap-4">
        <span className="grid place-items-center h-14 w-14 rounded-2xl bg-oak-soft text-oak-deep shrink-0">
          <FolderOpen className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <Crumbs chain={chain.slice(0, -1)} />
          <h2 className="font-bold text-lg leading-snug mt-1">{c.title}</h2>
          <p className="text-sm text-muted">
            {ms.length} חומרים בתיקייה ובכל תתי-הפרקים שלה
            {!c.bundlePrice && ms.length > 0 && " · 30% הנחה לעומת רכישה בודדת"}
          </p>
          <Link href={chainToHref(chain)} className="text-xs text-blue-deep hover:underline">
            חזרה לתיקייה
          </Link>
        </div>
        <span className="ms-auto font-display font-bold text-xl text-blue-deep whitespace-nowrap">
          {formatPrice(price)}
        </span>
      </div>
    );
    formProps = { kind: "bundle", categoryId: c.id, basePrice: price, months: 1, premiumDefault };
  } else if (planKey === "subject_monthly" || planKey === "custom_monthly" || planKey === "yearly") {
    const def = PLANS[planKey];
    const days = def.days ?? 30;
    const months = Math.max(1, Math.round(days / 30));
    await loadSubjects();
    const catId = num(sp.category);
    let scopeTitle: string | null = null;
    if (planKey === "subject_monthly" && catId) {
      const s = subjects.find((x) => x.id === catId);
      scopeTitle = s ? `${s.icon} ${s.title}` : null;
    }
    const pre =
      planKey === "custom_monthly"
        ? (sp.categories ?? "")
            .split(",")
            .map((x) => num(x.trim()))
            .filter((x): x is number => !!x && subjects.some((s) => s.id === x))
        : catId
          ? [catId]
          : [];
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
            תוקף: {days} ימים · עד {def.downloadsLimit} הורדות
            {scopeTitle && <> · מקצוע: <b className="text-foreground">{scopeTitle}</b></>}
          </p>
        </div>
        <span className="ms-auto font-display font-bold text-xl text-blue-deep whitespace-nowrap">
          {formatPrice(def.price ?? 0)}
        </span>
      </div>
    );
    formProps = {
      kind: "plan",
      plan: planKey,
      categoryId: planKey === "subject_monthly" && scopeTitle ? catId : undefined,
      subjects,
      preselected: pre,
      basePrice: def.price ?? 0,
      months,
      premiumDefault,
    };
  } else if (premiumDefault) {
    heading = "מנוי פרימיום";
    summary = (
      <div className="flex gap-4">
        <span className="grid place-items-center h-14 w-14 rounded-2xl bg-gold-soft text-[#8a6500] shrink-0">
          <Sparkles className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-lg leading-snug">פרימיום ל-30 יום</h2>
          <p className="text-sm text-muted">
            גישה לשאלות מבגרויות קודמות, מצגות, טיפים למסירה, רעיונות וחידות – ולפורום המורות.
            שימי לב: פרימיום לבדו אינו כולל הורדות; ההורדות נעשות דרך רכישה בודדת, קובץ מורחב או מנוי.
          </p>
        </div>
        <span className="ms-auto font-display font-bold text-xl text-blue-deep whitespace-nowrap">
          {formatPrice(PREMIUM_ADDON_PRICE)}
        </span>
      </div>
    );
    formProps = { kind: "premium", basePrice: PREMIUM_ADDON_PRICE, months: 1, allowPremium: false };
  }

  if (!formProps) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-4">
        <ShoppingBag className="h-12 w-12 mx-auto text-blue" />
        <h1 className="font-display text-3xl font-bold">הסל ריק</h1>
        <p className="text-muted">בחרי חומר, תיקייה או מסלול כדי להמשיך.</p>
        <div className="flex gap-2 justify-center">
          <Link href="/subjects" className="btn btn-primary">
            למקצועות
          </Link>
          <Link href="/pricing" className="btn btn-ghost">
            למסלולים
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-6 animate-fade-up">
        <p className="text-sm text-muted flex items-center gap-1">
          <ShoppingBag className="h-4 w-4" /> השלמת הזמנה
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold">{heading}</h1>
        <p className="text-muted mt-1">
          שלום {user.name.split(" ")[0]}, בדקי את פרטי ההזמנה ואשרי.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] items-start">
        <section className="card p-5 sm:p-6 animate-fade-up">
          <h2 className="text-sm font-semibold text-muted mb-4 flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> סיכום הזמנה
          </h2>
          {summary}
          <div className="mt-5 rounded-xl bg-oak-soft/50 p-3 text-xs text-oak-deep leading-relaxed">
            כל קובץ שתורידי יוטבע במספר האישי שלך (<b dir="ltr">{user.personalCode}</b>) – כך אנחנו
            שומרים על זכויות היוצרים של הכותבות.
          </div>
        </section>
        <section className="card p-5 sm:p-6 animate-fade-up [animation-delay:100ms]">
          <CheckoutForm {...formProps} />
        </section>
      </div>
    </div>
  );
}
