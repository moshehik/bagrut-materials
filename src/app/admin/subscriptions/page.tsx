import Link from "next/link";
import { and, desc, eq, gt, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { purchases, users, categories, materials, planEnum, purchaseStatusEnum } from "@/db/schema";
import { PLANS } from "@/lib/constants";
import { getRootSubjects } from "@/lib/data";
import { SubscriptionRow, type SubscriptionRowData } from "@/components/admin/subscription-row";
import { ManualPurchaseForm } from "@/components/admin/manual-purchase-form";

export const dynamic = "force-dynamic";

type SP = {
  status?: string;
  plan?: string;
  user?: string;
  expiring?: string;
  active?: string;
};

const STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  cancelled: "בוטל",
  refunded: "זוכה",
  expired: "פג",
};

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const status = purchaseStatusEnum.enumValues.find((s) => s === sp.status);
  const plan = planEnum.enumValues.find((p) => p === sp.plan);
  const userId = sp.user && Number.isInteger(Number(sp.user)) ? Number(sp.user) : undefined;
  const expiring = sp.expiring === "1";
  const activeOnly = sp.active === "1";
  const now = new Date();

  const conds: SQL[] = [];
  if (status) conds.push(eq(purchases.status, status));
  if (plan) conds.push(eq(purchases.plan, plan));
  if (userId) conds.push(eq(purchases.userId, userId));
  if (activeOnly) {
    conds.push(eq(purchases.status, "active"));
    conds.push(or(isNull(purchases.endsAt), gt(purchases.endsAt, now))!);
  }
  if (expiring) {
    const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    conds.push(eq(purchases.status, "active"));
    conds.push(gt(purchases.endsAt, now));
    conds.push(lt(purchases.endsAt, week));
  }

  const [rows, roots, focusUser] = await Promise.all([
    db
      .select({
        id: purchases.id,
        userId: purchases.userId,
        userName: users.name,
        userEmail: users.email,
        plan: purchases.plan,
        categoryTitle: categories.title,
        materialTitle: materials.title,
        amount: purchases.amount,
        downloadsUsed: purchases.downloadsUsed,
        downloadsLimit: purchases.downloadsLimit,
        startsAt: purchases.startsAt,
        endsAt: purchases.endsAt,
        premium: purchases.premium,
        status: purchases.status,
        paymentRef: purchases.paymentRef,
        notes: purchases.notes,
      })
      .from(purchases)
      .innerJoin(users, eq(users.id, purchases.userId))
      .leftJoin(categories, eq(categories.id, purchases.categoryId))
      .leftJoin(materials, eq(materials.id, purchases.materialId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(purchases.createdAt))
      .limit(300),
    getRootSubjects(true),
    userId
      ? db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
      : Promise.resolve([]),
  ]);

  const [{ activeCount }] = await db
    .select({ activeCount: sql<number>`count(*)::int` })
    .from(purchases)
    .where(and(eq(purchases.status, "active"), or(isNull(purchases.endsAt), gt(purchases.endsAt, now))));

  const data: SubscriptionRowData[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    plan: r.plan,
    scopeTitle: r.materialTitle ?? r.categoryTitle ?? null,
    amount: r.amount,
    downloadsUsed: r.downloadsUsed,
    downloadsLimit: r.downloadsLimit,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    premium: r.premium,
    status: r.status,
    paymentRef: r.paymentRef,
    notes: r.notes,
  }));

  const focus = focusUser[0];

  const link = (patch: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/subscriptions${s ? `?${s}` : ""}`;
  };
  const chipCls = (on: boolean) =>
    `chip text-xs ${on ? "bg-oak text-white" : "bg-oak-soft text-oak-deep hover:bg-oak/30"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">מנויים ורכישות</h2>
        <span className="chip bg-green-100 text-green-800">{activeCount} פעילים</span>
        <span className="chip bg-blue-soft text-blue-deep">{rows.length} מוצגים</span>
        {focus && (
          <span className="chip bg-pink-soft text-pink">
            משתמשת: {focus.name} ·{" "}
            <Link href={link({ user: undefined })} className="underline">
              הסרה
            </Link>
          </span>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">מהיר:</span>
          <Link href={link({ active: activeOnly ? undefined : "1", expiring: undefined, status: undefined })} className={chipCls(activeOnly)}>
            פעילים בלבד
          </Link>
          <Link href={link({ expiring: expiring ? undefined : "1", active: undefined, status: undefined })} className={chipCls(expiring)}>
            פגים תוך 7 ימים
          </Link>
          <Link href="/admin/subscriptions" className="chip text-xs bg-gray-100 text-gray-700 hover:bg-gray-200">
            ניקוי
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">סטטוס:</span>
          {purchaseStatusEnum.enumValues.map((s) => (
            <Link key={s} href={link({ status: status === s ? undefined : s, active: undefined, expiring: undefined })} className={chipCls(status === s)}>
              {STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">מסלול:</span>
          {planEnum.enumValues.map((p) => (
            <Link key={p} href={link({ plan: plan === p ? undefined : p })} className={chipCls(plan === p)}>
              {PLANS[p].label}
            </Link>
          ))}
        </div>
      </div>

      <details className="card p-5">
        <summary className="cursor-pointer font-bold">➕ הוספת מנוי ידני</summary>
        <p className="text-xs text-muted mt-1 mb-4">
          לרישום מנוי ששולם מחוץ לאתר (העברה/מזומן). תירשם גם תנועה כספית מסוג &quot;ידני&quot;.
        </p>
        <ManualPurchaseForm
          subjects={roots.map((r) => ({ id: r.id, title: r.title, icon: r.icon }))}
          defaultEmail={focus?.email ?? ""}
        />
      </details>

      <div className="card p-3 sm:p-5 overflow-x-auto">
        {data.length === 0 ? (
          <p className="text-muted text-sm">אין מנויים התואמים לסינון.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <th className="py-2 pe-3 font-medium">משתמשת</th>
                <th className="py-2 pe-3 font-medium">מסלול</th>
                <th className="py-2 pe-3 font-medium">סכום</th>
                <th className="py-2 pe-3 font-medium">הורדות</th>
                <th className="py-2 pe-3 font-medium">תוקף</th>
                <th className="py-2 pe-3 font-medium">פרימיום</th>
                <th className="py-2 pe-3 font-medium">סטטוס</th>
                <th className="py-2 pe-3 font-medium">אסמכתא</th>
                <th className="py-2 pe-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <SubscriptionRow key={p.id} p={p} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
