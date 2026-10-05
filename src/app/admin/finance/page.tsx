import { requireAdminPage } from "@/lib/session";
import Link from "next/link";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { transactions, users, purchases, txTypeEnum } from "@/db/schema";
import { PLANS, formatPrice } from "@/lib/constants";
import { TransactionForm, TX_TYPE_LABELS } from "@/components/admin/transaction-form";

export const dynamic = "force-dynamic";

type SP = { type?: string; user?: string; from?: string; to?: string; page?: string };

const PAGE_SIZE = 100;

function parseDate(s?: string) {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const TX_CLASS: Record<string, string> = {
  charge: "bg-green-100 text-green-800",
  refund: "bg-red-100 text-red-700",
  manual: "bg-blue-soft text-blue-deep",
  adjustment: "bg-gray-100 text-gray-700",
};

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const type = txTypeEnum.enumValues.find((t) => t === sp.type);
  const userId = sp.user && Number.isInteger(Number(sp.user)) ? Number(sp.user) : undefined;
  const from = parseDate(sp.from);
  const to = parseDate(sp.to);
  const page = Math.max(1, Number(sp.page) || 1);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  /* ---------- KPIs ---------- */
  const revenueSince = (since: Date | null) =>
    sql<number>`coalesce(sum(case when ${transactions.type} in ('charge','manual') ${
      since ? sql`and ${transactions.createdAt} >= ${since}` : sql``
    } then ${transactions.amount} else 0 end), 0)::int`;

  const [kpi] = await db
    .select({
      today: revenueSince(startOfDay),
      d30: revenueSince(d30),
      year: revenueSince(startOfYear),
      all: revenueSince(null),
      refunds: sql<number>`coalesce(sum(case when ${transactions.type} = 'refund' then ${transactions.amount} else 0 end), 0)::int`,
      adjustments: sql<number>`coalesce(sum(case when ${transactions.type} = 'adjustment' then ${transactions.amount} else 0 end), 0)::int`,
      orders: sql<number>`count(*) filter (where ${transactions.type} in ('charge','manual') and ${transactions.amount} > 0)::int`,
    })
    .from(transactions);

  const net = kpi.all + kpi.refunds + kpi.adjustments;
  const avgOrder = kpi.orders > 0 ? Math.round(kpi.all / kpi.orders) : 0;

  const [mrr] = await db
    .select({
      monthly: sql<number>`coalesce(sum(case when ${purchases.plan} in ('subject_monthly','custom_monthly') then ${purchases.amount} else 0 end), 0)::int`,
      yearly: sql<number>`coalesce(sum(case when ${purchases.plan} = 'yearly' then ${purchases.amount} else 0 end), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.status, "active"),
        sql`(${purchases.endsAt} is null or ${purchases.endsAt} > now())`,
      ),
    );
  const mrrEstimate = mrr.monthly + Math.round(mrr.yearly / 12);

  /* ---------- monthly (12 months) ---------- */
  const monthlyRows = await db.execute<{ month: string; revenue: number; refunds: number; n: number }>(sql`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
           coalesce(sum(case when type in ('charge','manual') then amount else 0 end), 0)::int AS revenue,
           coalesce(sum(case when type = 'refund' then amount else 0 end), 0)::int AS refunds,
           count(*)::int AS n
    FROM transactions
    WHERE created_at >= date_trunc('month', now()) - interval '11 months'
    GROUP BY 1
    ORDER BY 1
  `);
  const monthMap = new Map(monthlyRows.rows.map((r) => [r.month, r]));
  const months: { key: string; label: string; revenue: number; refunds: number; n: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const r = monthMap.get(key);
    months.push({
      key,
      label: d.toLocaleDateString("he-IL", { month: "short", year: "2-digit" }),
      revenue: Number(r?.revenue ?? 0),
      refunds: Number(r?.refunds ?? 0),
      n: Number(r?.n ?? 0),
    });
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.revenue));

  /* ---------- ledger ---------- */
  const conds: SQL[] = [];
  if (type) conds.push(eq(transactions.type, type));
  if (userId) conds.push(eq(transactions.userId, userId));
  if (from) conds.push(gte(transactions.createdAt, from));
  if (to) conds.push(lte(transactions.createdAt, new Date(to.getTime() + 24 * 60 * 60 * 1000)));
  const where = conds.length ? and(...conds) : undefined;

  const [ledger, [{ total }], focusUser] = await Promise.all([
    db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        userName: users.name,
        userEmail: users.email,
        purchaseId: transactions.purchaseId,
        purchasePlan: purchases.plan,
        type: transactions.type,
        amount: transactions.amount,
        method: transactions.method,
        reference: transactions.reference,
        note: transactions.note,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(users, eq(users.id, transactions.userId))
      .leftJoin(purchases, eq(purchases.id, transactions.purchaseId))
      .where(where)
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(transactions).where(where),
    userId
      ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
      : Promise.resolve([]),
  ]);
  const focus = focusUser[0];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const link = (patch: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/finance${s ? `?${s}` : ""}`;
  };
  const exportHref = link({ page: undefined }).replace("/admin/finance", "/admin/finance/export");
  const chipCls = (on: boolean) =>
    `chip text-xs ${on ? "bg-oak text-white" : "bg-oak-soft text-oak-deep hover:bg-oak/30"}`;

  const kpis = [
    { label: "היום", value: kpi.today },
    { label: "30 יום", value: kpi.d30 },
    { label: "השנה", value: kpi.year },
    { label: "סה״כ הכנסות", value: kpi.all },
    { label: "זיכויים", value: kpi.refunds, tone: "text-red-700" },
    { label: "נטו", value: net, tone: "text-green-800" },
    { label: "ממוצע להזמנה", value: avgOrder },
    { label: "MRR משוער", value: mrrEstimate, hint: "מנויים חודשיים פעילים + שנתיים/12" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">כספים</h2>
        <span className="chip bg-blue-soft text-blue-deep">{total} תנועות</span>
        {focus && (
          <span className="chip bg-pink-soft text-pink">
            משתמשת: {focus.name} ·{" "}
            <Link href={link({ user: undefined, page: undefined })} className="underline">
              הסרה
            </Link>
          </span>
        )}
        <a href={exportHref} className="btn btn-ghost text-xs py-1 ms-auto">
          <Download className="h-3.5 w-3.5" /> ייצוא CSV
        </a>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-xs text-muted">{k.label}</div>
            <div className={`font-display text-2xl font-bold mt-1 ${k.tone ?? "text-oak-deep"}`}>
              {formatPrice(k.value)}
            </div>
            {k.hint && <div className="text-[11px] text-muted mt-1">{k.hint}</div>}
          </div>
        ))}
      </div>

      {/* Monthly */}
      <section className="card p-5">
        <h3 className="font-bold text-lg mb-3">הכנסות לפי חודש (12 חודשים)</h3>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${months.length * 56} 160`} className="w-full min-w-[560px] h-44" role="img" aria-label="הכנסות חודשיות">
            {months.map((m, i) => {
              const h = Math.round((m.revenue / maxMonth) * 110);
              const x = (months.length - 1 - i) * 56 + 8; // RTL: החודש האחרון בצד ימין
              return (
                <g key={m.key}>
                  <rect x={x} y={130 - h} width={40} height={h} rx={6} fill="var(--oak, #c1613b)" opacity={0.85}>
                    <title>
                      {m.label}: {formatPrice(m.revenue)}
                    </title>
                  </rect>
                  <text x={x + 20} y={124 - h} textAnchor="middle" fontSize="10" fill="currentColor">
                    {m.revenue > 0 ? Math.round(m.revenue / 100) : ""}
                  </text>
                  <text x={x + 20} y={148} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.7}>
                    {m.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <th className="py-1.5 pe-3 font-medium">חודש</th>
                <th className="py-1.5 pe-3 font-medium">הכנסות</th>
                <th className="py-1.5 pe-3 font-medium">זיכויים</th>
                <th className="py-1.5 pe-3 font-medium">נטו</th>
                <th className="py-1.5 pe-3 font-medium">תנועות</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.key} className="border-t border-foreground/5">
                  <td className="py-1.5 pe-3">{m.label}</td>
                  <td className="py-1.5 pe-3">{formatPrice(m.revenue)}</td>
                  <td className="py-1.5 pe-3 text-red-700">{m.refunds ? formatPrice(m.refunds) : "—"}</td>
                  <td className="py-1.5 pe-3 font-semibold">{formatPrice(m.revenue + m.refunds)}</td>
                  <td className="py-1.5 pe-3">{m.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Manual transaction */}
      <details className="card p-5">
        <summary className="cursor-pointer font-bold">➕ רישום תנועה ידנית</summary>
        <div className="mt-4">
          <TransactionForm defaultEmail={focus?.email ?? ""} />
        </div>
      </details>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">סוג:</span>
          {txTypeEnum.enumValues.map((t) => (
            <Link key={t} href={link({ type: type === t ? undefined : t, page: undefined })} className={chipCls(type === t)}>
              {TX_TYPE_LABELS[t]}
            </Link>
          ))}
        </div>
        <form action="/admin/finance" className="flex flex-wrap items-end gap-2 text-sm">
          {type && <input type="hidden" name="type" value={type} />}
          {userId && <input type="hidden" name="user" value={userId} />}
          <label className="text-xs">
            <span className="block mb-0.5 text-muted">מתאריך</span>
            <input type="date" name="from" defaultValue={sp.from ?? ""} className="input py-1 text-xs" />
          </label>
          <label className="text-xs">
            <span className="block mb-0.5 text-muted">עד תאריך</span>
            <input type="date" name="to" defaultValue={sp.to ?? ""} className="input py-1 text-xs" />
          </label>
          <button className="btn btn-oak text-xs py-1.5">סינון</button>
          <Link href="/admin/finance" className="btn btn-ghost text-xs py-1.5">
            ניקוי
          </Link>
        </form>
      </div>

      {/* Ledger */}
      <div className="card p-3 sm:p-5 overflow-x-auto">
        <h3 className="font-bold text-lg mb-3">יומן תנועות</h3>
        {ledger.length === 0 ? (
          <p className="text-muted text-sm">אין תנועות להצגה.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <th className="py-2 pe-3 font-medium">תאריך</th>
                <th className="py-2 pe-3 font-medium">משתמשת</th>
                <th className="py-2 pe-3 font-medium">סוג</th>
                <th className="py-2 pe-3 font-medium">סכום</th>
                <th className="py-2 pe-3 font-medium">רכישה</th>
                <th className="py-2 pe-3 font-medium">אמצעי</th>
                <th className="py-2 pe-3 font-medium">אסמכתא</th>
                <th className="py-2 pe-3 font-medium">הערה</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((t) => (
                <tr key={t.id} className="border-t border-foreground/5 align-top">
                  <td className="py-2 pe-3 whitespace-nowrap text-xs">
                    {t.createdAt.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="py-2 pe-3">
                    {t.userId ? (
                      <Link href={link({ user: String(t.userId), page: undefined })} className="hover:text-blue-deep">
                        <div className="font-medium">{t.userName}</div>
                        <div className="text-xs text-muted" dir="ltr">
                          {t.userEmail}
                        </div>
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 pe-3">
                    <span className={`chip ${TX_CLASS[t.type] ?? ""}`}>{TX_TYPE_LABELS[t.type] ?? t.type}</span>
                  </td>
                  <td className={`py-2 pe-3 whitespace-nowrap font-semibold ${t.amount < 0 ? "text-red-700" : ""}`}>
                    {formatPrice(t.amount)}
                  </td>
                  <td className="py-2 pe-3 text-xs">
                    {t.purchaseId ? (
                      <Link href={`/admin/subscriptions?user=${t.userId ?? ""}`} className="text-blue-deep hover:underline">
                        #{t.purchaseId}
                        {t.purchasePlan && <span className="text-muted"> · {PLANS[t.purchasePlan].label}</span>}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pe-3 text-xs">{t.method ?? "—"}</td>
                  <td className="py-2 pe-3 font-mono text-[11px]" dir="ltr">
                    {t.reference ?? "—"}
                  </td>
                  <td className="py-2 pe-3 text-xs max-w-[240px]">{t.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <div className="flex items-center gap-2 mt-4 text-sm">
            {page > 1 && (
              <Link href={link({ page: String(page - 1) })} className="btn btn-ghost text-xs py-1">
                הקודם
              </Link>
            )}
            <span className="text-muted">
              עמוד {page} מתוך {pages}
            </span>
            {page < pages && (
              <Link href={link({ page: String(page + 1) })} className="btn btn-ghost text-xs py-1">
                הבא
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
