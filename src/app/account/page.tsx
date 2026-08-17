import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import {
  UserRound,
  Fingerprint,
  Sparkles,
  Download,
  ShoppingBag,
  MessagesSquare,
  Store,
  BookOpen,
  CheckCircle2,
  Crown,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/db";
import { categories, downloads, materials, purchases } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { userHasPremium, getCategoryChain, chainToHref } from "@/lib/data";
import { PLANS, TIERS, MATERIAL_KINDS, formatPrice } from "@/lib/constants";

export const metadata: Metadata = { title: "האזור האישי" };
export const dynamic = "force-dynamic";

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }) : "ללא הגבלה";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string }>;
}) {
  const { purchased } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const now = new Date();
  const [hasPremium, activePurchases, recent] = await Promise.all([
    userHasPremium(user),
    db
      .select({
        p: purchases,
        materialTitle: materials.title,
        categoryTitle: categories.title,
      })
      .from(purchases)
      .leftJoin(materials, eq(purchases.materialId, materials.id))
      .leftJoin(categories, eq(purchases.categoryId, categories.id))
      .where(
        and(eq(purchases.userId, user.id), or(isNull(purchases.endsAt), gt(purchases.endsAt, now))),
      )
      .orderBy(desc(purchases.createdAt)),
    db
      .select({
        id: downloads.id,
        createdAt: downloads.createdAt,
        materialId: materials.id,
        title: materials.title,
        kind: materials.kind,
        categoryId: materials.categoryId,
      })
      .from(downloads)
      .innerJoin(materials, eq(downloads.materialId, materials.id))
      .where(eq(downloads.userId, user.id))
      .orderBy(desc(downloads.createdAt))
      .limit(10),
  ]);

  // קישורים לפרקים של ההורדות האחרונות
  const hrefCache = new Map<number, string>();
  const recentWithHref = [];
  for (const r of recent) {
    let href = hrefCache.get(r.categoryId);
    if (!href) {
      href = chainToHref(await getCategoryChain(r.categoryId));
      hrefCache.set(r.categoryId, href);
    }
    recentWithHref.push({ ...r, href });
  }

  const tier = TIERS[user.tier];
  const premiumEnds = activePurchases
    .filter((r) => r.p.premium && r.p.endsAt)
    .map((r) => r.p.endsAt as Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      {purchased && (
        <div className="card p-4 flex items-center gap-3 border-emerald-200 bg-emerald-50 text-emerald-900 animate-pop">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            <b>ההזמנה נרשמה בהצלחה!</b> אפשר להתחיל להוריד. הרכישה מופיעה בטבלה למטה.
          </p>
        </div>
      )}

      <header className="animate-fade-up flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm text-muted flex items-center gap-1">
            <UserRound className="h-4 w-4" /> האזור האישי
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold">שלום, {user.name}</h1>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <span
            className="chip text-sm py-1.5 px-3"
            style={{ background: tier.color + "22", color: tier.color }}
            title="דרגת החברות שלך"
          >
            {tier.icon} דרגה: {tier.label}
          </span>
          {hasPremium ? (
            <span className="chip text-sm py-1.5 px-3 bg-gold-soft text-[#8a6500]">
              <Sparkles className="h-3.5 w-3.5" /> פרימיום פעיל
              {premiumEnds && <span className="opacity-70">· עד {fmtDate(premiumEnds)}</span>}
            </span>
          ) : (
            <Link href="/checkout?premium=1" className="btn btn-gold text-sm py-1.5">
              <Crown className="h-4 w-4" /> שדרגי לפרימיום
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* פרטים אישיים */}
        <section className="card p-6 animate-fade-up">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <UserRound className="h-5 w-5 text-blue" /> הפרטים שלי
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">שם</dt>
              <dd className="font-semibold">{user.name}</dd>
            </div>
            <div>
              <dt className="text-muted">מייל</dt>
              <dd className="font-semibold" dir="ltr">
                {user.email}
              </dd>
            </div>
            <div>
              <dt className="text-muted">חברה מאז</dt>
              <dd className="font-semibold">{fmtDate(user.createdAt)}</dd>
            </div>
            {user.role === "admin" && (
              <div>
                <dt className="text-muted">הרשאה</dt>
                <dd>
                  <Link href="/admin" className="chip bg-oak-soft text-oak-deep">
                    <ShieldCheck className="h-3.5 w-3.5" /> מנהלת האתר
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* מספר אישי */}
        <section className="card p-6 animate-fade-up [animation-delay:80ms] bg-gradient-to-br from-white to-blue-soft/50">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-pink" /> המספר האישי שלך
          </h2>
          <div
            className="font-mono text-2xl sm:text-3xl font-bold tracking-widest text-blue-deep bg-white rounded-2xl px-4 py-3 text-center border border-blue/15 shadow-inner"
            dir="ltr"
          >
            {user.personalCode}
          </div>
          <p className="text-sm text-muted mt-3 leading-relaxed">
            מספר זה מוטבע על כל קובץ שאת מורידה – בשולי העמוד וכסימן מים שקוף. כך החומרים שומרים על
            זכויות היוצרים של הכותבות, ואת יכולה להשתמש בהם בכיתה בחופשיות. נא לא להעביר קבצים
            הלאה.
          </p>
        </section>

        {/* קישורים מהירים */}
        <section className="card p-6 animate-fade-up [animation-delay:160ms]">
          <h2 className="font-bold text-lg mb-4">קיצורי דרך</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/subjects", label: "המקצועות", icon: BookOpen, cls: "bg-blue-soft text-blue-deep" },
              { href: "/pricing", label: "מסלולים", icon: ShoppingBag, cls: "bg-pink-soft text-pink" },
              { href: "/forum", label: "פורום מורות", icon: MessagesSquare, cls: "bg-gold-soft text-[#8a6500]" },
              { href: "/sell", label: "מכירת חומרים", icon: Store, cls: "bg-oak-soft text-oak-deep" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl p-3 text-sm font-semibold flex flex-col gap-2 card-hover ${l.cls}`}
              >
                <l.icon className="h-5 w-5" />
                {l.label}
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* רכישות ומנויים */}
      <section className="card p-6 animate-fade-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-blue" /> רכישות ומנויים פעילים
          </h2>
          <Link href="/pricing" className="text-sm text-blue-deep hover:underline">
            למסלולים
          </Link>
        </div>
        {activePurchases.length === 0 ? (
          <div className="text-center py-10 text-muted">
            <p>עדיין אין רכישות פעילות.</p>
            <Link href="/pricing" className="btn btn-primary mt-4">
              בחרי מסלול
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-muted text-start border-b border-foreground/10">
                  <th className="text-start font-medium py-2 px-2">מסלול</th>
                  <th className="text-start font-medium py-2 px-2">היקף</th>
                  <th className="text-start font-medium py-2 px-2">הורדות</th>
                  <th className="text-start font-medium py-2 px-2">בתוקף עד</th>
                  <th className="text-start font-medium py-2 px-2">פרימיום</th>
                  <th className="text-start font-medium py-2 px-2">סכום</th>
                </tr>
              </thead>
              <tbody>
                {activePurchases.map(({ p, materialTitle, categoryTitle }) => {
                  const isPremiumOnly = p.plan === "single" && !p.materialId && p.premium;
                  const scope = isPremiumOnly
                    ? "פרימיום בלבד"
                    : materialTitle ?? categoryTitle ?? (p.plan === "yearly" ? "כל המקצועות" : "—");
                  const usage =
                    p.downloadsLimit === null
                      ? "ללא הגבלה"
                      : p.downloadsLimit === 0
                        ? "—"
                        : `${p.downloadsUsed} / ${p.downloadsLimit}`;
                  const pct =
                    p.downloadsLimit && p.downloadsLimit > 0
                      ? Math.min(100, Math.round((p.downloadsUsed / p.downloadsLimit) * 100))
                      : null;
                  return (
                    <tr key={p.id} className="border-b border-foreground/5 last:border-0">
                      <td className="py-3 px-2 font-semibold">
                        {isPremiumOnly ? "מנוי פרימיום" : PLANS[p.plan].label}
                      </td>
                      <td className="py-3 px-2">{scope}</td>
                      <td className="py-3 px-2">
                        <span>{usage}</span>
                        {pct !== null && (
                          <span className="block h-1.5 w-24 rounded-full bg-blue-soft mt-1 overflow-hidden">
                            <span
                              className="block h-full rounded-full bg-gradient-to-l from-blue to-pink"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2">{fmtDate(p.endsAt)}</td>
                      <td className="py-3 px-2">
                        {p.premium ? (
                          <span className="chip bg-gold-soft text-[#8a6500]">
                            <Sparkles className="h-3 w-3" /> כן
                          </span>
                        ) : (
                          <span className="text-muted">לא</span>
                        )}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">{formatPrice(p.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* הורדות אחרונות */}
      <section className="card p-6 animate-fade-up">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Download className="h-5 w-5 text-pink" /> הורדות אחרונות
        </h2>
        {recentWithHref.length === 0 ? (
          <div className="text-center py-10 text-muted">
            <p>עדיין לא הורדת חומרים.</p>
            <Link href="/subjects" className="btn btn-ghost mt-4">
              לגלות את המקצועות
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-foreground/5">
            {recentWithHref.map((r) => (
              <li key={r.id} className="py-3 flex items-center gap-3">
                <span className="text-xl">{MATERIAL_KINDS[r.kind].icon}</span>
                <div className="min-w-0 flex-1">
                  <Link href={r.href} className="font-semibold hover:text-blue-deep line-clamp-1">
                    {r.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {MATERIAL_KINDS[r.kind].label} · {fmtDate(r.createdAt)}
                  </p>
                </div>
                <a
                  href={`/api/download/${r.materialId}`}
                  className="btn btn-ghost text-xs py-1.5 px-3"
                  title="הורדה חוזרת"
                >
                  <Download className="h-3.5 w-3.5" /> הורידי שוב
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
