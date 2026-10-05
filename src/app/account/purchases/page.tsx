import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { CheckCircle2, ShoppingBag, XCircle } from "lucide-react";
import { db } from "@/db";
import { categories, materials, purchases } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { PLANS, formatPrice } from "@/lib/constants";
import { requestCancelSubscriptionAction } from "@/lib/actions/profile";
import { AccountArrow, AccountTitle, Notice, Panel, PlanNut, fmtDate } from "@/components/account-ui";

export const metadata: Metadata = { title: "רכישות ומנויים" };
export const dynamic = "force-dynamic";

export default async function AccountPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelreq?: string }>;
}) {
  const { cancelreq } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/purchases");

  const now = new Date();
  const activePurchases = await db
    .select({
      p: purchases,
      materialTitle: materials.title,
      categoryTitle: categories.title,
    })
    .from(purchases)
    .leftJoin(materials, eq(purchases.materialId, materials.id))
    .leftJoin(categories, eq(purchases.categoryId, categories.id))
    .where(and(eq(purchases.userId, user.id), or(isNull(purchases.endsAt), gt(purchases.endsAt, now))))
    .orderBy(desc(purchases.createdAt));

  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle title="רכישות ומנויים" subtitle="המנויים והרכישות הפעילים שלך." back />

      {cancelreq === "1" && (
        <Notice icon={CheckCircle2}>בקשת ביטול המנוי נשלחה למנהלת האתר – נחזור אלייך בהקדם.</Notice>
      )}

      <Panel
        id="purchases-h"
        title="הפעילים"
        icon={ShoppingBag}
        aside={
          <Link href="/pricing" className="btn btn-gold btn-gate py-1.5">
            למסלולים <AccountArrow />
          </Link>
        }
      >
        {activePurchases.length === 0 ? (
          <div className="gate-card py-8 text-center">
            <p className="text-xl">עדיין אין רכישות פעילות.</p>
            <Link href="/pricing" className="btn btn-gold btn-gate mt-4 py-2">
              בחרי מסלול <AccountArrow />
            </Link>
          </div>
        ) : (
          <ul className="space-y-5">
            {activePurchases.map(({ p, materialTitle, categoryTitle }) => {
              const scope = p.subjectsPending
                ? "ממתין לבחירת מקצועות"
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
                <li key={p.id} className="gate-card flex items-start gap-4">
                  <PlanNut plan={p.plan} />
                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-2xl">{PLANS[p.plan].label}</h3>
                    <span className="ms-auto text-2xl">{formatPrice(p.amount)}</span>
                  </div>
                  <p className="gate-soft">{scope}</p>
                  <hr className="gate-divider" />
                  <dl className="grid gap-x-6 gap-y-2 text-lg sm:grid-cols-2">
                    <div>
                      <dt className="gate-soft text-base">הורדות</dt>
                      <dd>
                        <bdi dir="ltr">{usage}</bdi>
                        {pct !== null && (
                          <span className="acc-meter mt-1 block" role="presentation">
                            <span style={{ width: `${pct}%` }} />
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="gate-soft text-base">בתוקף עד</dt>
                      <dd>{fmtDate(p.endsAt)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-lg">
                    {p.plan === "yearly" && (
                      <Link href="/account/subjects" className="acc-link">
                        {p.subjectsPending ? "בחירת מקצועות" : "המקצועות שלי"}
                      </Link>
                    )}
                    <form action={requestCancelSubscriptionAction} className="ms-auto">
                      <input type="hidden" name="purchaseId" value={p.id} />
                      <button
                        type="submit"
                        className="gate-soft flex items-center gap-1 text-base underline-offset-4 transition-transform hover:-translate-y-0.5 hover:underline"
                        title="בקשת ביטול המנוי – תטופל על ידי מנהלת האתר"
                      >
                        <XCircle className="h-4 w-4" aria-hidden /> בקשת ביטול
                      </button>
                    </form>
                  </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
