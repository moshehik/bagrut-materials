import Link from "next/link";
import { and, count, desc, eq, gte, inArray, sum } from "drizzle-orm";
import { Radio, Download, Activity, Wallet, BarChart3, ScrollText } from "lucide-react";
import { db } from "@/db";
import { users, categories, materials, downloads, purchases, pageViews, transactions } from "@/db/schema";
import { formatPrice } from "@/lib/constants";
import { getNumber } from "@/lib/settings";
import { daysAgo, minutesAgo, startOfToday } from "@/lib/admin-analytics";

export const dynamic = "force-dynamic";

async function safeCount(p: Promise<{ n: number }[]>): Promise<number> {
  try {
    const [r] = await p;
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

export default async function AdminDashboard() {
  const windowMin = Math.max(1, await getNumber("online_window_minutes"));
  const since = minutesAgo(windowMin);
  const today = startOfToday();
  const d30 = daysAgo(30);

  const [onlineNow, dlToday, viewsToday, revenue30] = await Promise.all([
    safeCount(db.select({ n: count() }).from(users).where(gte(users.lastSeenAt, since))),
    safeCount(db.select({ n: count() }).from(downloads).where(gte(downloads.createdAt, today))),
    safeCount(db.select({ n: count() }).from(pageViews).where(gte(pageViews.createdAt, today))),
    db
      .select({ s: sum(transactions.amount) })
      .from(transactions)
      .where(and(inArray(transactions.type, ["charge", "manual"]), gte(transactions.createdAt, d30)))
      .then(([r]) => Number(r?.s ?? 0))
      .catch(() => 0),
  ]);

  const quick = [
    { label: "מחוברות עכשיו", value: onlineNow, href: "/admin/online", icon: Radio, tone: "bg-emerald-50 text-emerald-700" },
    { label: "הורדות היום", value: dlToday, href: "/admin/downloads", icon: Download, tone: "bg-gold-soft text-gold" },
    { label: "צפיות היום", value: viewsToday, href: "/admin/activity", icon: Activity, tone: "bg-pink-soft text-pink" },
    { label: "הכנסות 30 יום", value: formatPrice(revenue30), href: "/admin/finance", icon: Wallet, tone: "bg-blue-soft text-blue-deep" },
    { label: "סטטיסטיקות", value: "→", href: "/admin/stats", icon: BarChart3, tone: "bg-oak-soft text-oak-deep" },
    { label: "לוג פעולות", value: "→", href: "/admin/logs", icon: ScrollText, tone: "bg-violet-50 text-violet-700" },
  ];

  const [[u], [c], [m], [d], [p], [rev], latest] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(categories),
    db.select({ n: count() }).from(materials),
    db.select({ n: count() }).from(downloads),
    db.select({ n: count() }).from(purchases),
    db.select({ s: sum(purchases.amount) }).from(purchases),
    db
      .select({
        id: downloads.id,
        createdAt: downloads.createdAt,
        watermark: downloads.watermark,
        userName: users.name,
        userEmail: users.email,
        materialTitle: materials.title,
        materialId: materials.id,
        categoryId: materials.categoryId,
      })
      .from(downloads)
      .innerJoin(users, eq(downloads.userId, users.id))
      .innerJoin(materials, eq(downloads.materialId, materials.id))
      .orderBy(desc(downloads.createdAt))
      .limit(15),
  ]);

  const stats = [
    { label: "משתמשות", value: u.n, href: "/admin/users", tone: "bg-blue-soft text-blue-deep" },
    {
      label: "קטגוריות",
      value: c.n,
      href: "/admin/categories",
      tone: "bg-oak-soft text-oak-deep",
    },
    { label: "חומרים", value: m.n, href: "/admin/materials", tone: "bg-pink-soft text-pink" },
    { label: "הורדות", value: d.n, href: "#latest", tone: "bg-gold-soft text-gold" },
    { label: "רכישות", value: p.n, href: "#", tone: "bg-blue-soft text-blue-deep" },
    {
      label: "הכנסות",
      value: formatPrice(Number(rev.s ?? 0)),
      href: "#",
      tone: "bg-gold-soft text-gold",
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold">לוח בקרה</h2>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {quick.map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.href} href={q.href} className="card card-hover p-4 flex items-center gap-3">
              <span className={`chip ${q.tone} !p-2 rounded-xl`}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted truncate">{q.label}</span>
                <span className="block text-xl font-bold font-display tabular-nums">{q.value}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card card-hover p-4">
            <span className={`chip ${s.tone}`}>{s.label}</span>
            <div className="mt-3 text-3xl font-bold font-display">{s.value}</div>
          </Link>
        ))}
      </div>

      <section id="latest" className="card p-5">
        <h3 className="font-bold text-lg mb-3">הורדות אחרונות</h3>
        {latest.length === 0 ? (
          <p className="text-muted text-sm">עדיין אין הורדות.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted text-right">
                <tr>
                  <th className="py-2 pe-3 font-medium">תאריך</th>
                  <th className="py-2 pe-3 font-medium">משתמשת</th>
                  <th className="py-2 pe-3 font-medium">חומר</th>
                  <th className="py-2 pe-3 font-medium">סימן מים</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((r) => (
                  <tr key={r.id} className="border-t border-foreground/5">
                    <td className="py-2 pe-3 whitespace-nowrap">
                      {r.createdAt.toLocaleString("he-IL")}
                    </td>
                    <td className="py-2 pe-3">
                      {r.userName}{" "}
                      <span className="text-muted text-xs">({r.userEmail})</span>
                    </td>
                    <td className="py-2 pe-3">
                      <Link
                        href={`/admin/materials?category=${r.categoryId}`}
                        className="text-blue-deep hover:underline"
                      >
                        {r.materialTitle}
                      </Link>
                    </td>
                    <td className="py-2 pe-3 font-mono text-xs">{r.watermark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
