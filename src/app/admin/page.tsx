import Link from "next/link";
import { count, desc, eq, sum } from "drizzle-orm";
import { db } from "@/db";
import { users, categories, materials, downloads, purchases } from "@/db/schema";
import { formatPrice } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
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
