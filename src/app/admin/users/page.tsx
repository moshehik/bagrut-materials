import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, downloads } from "@/db/schema";
import { UserRoleForm } from "@/components/admin/user-role-form";
import { TIERS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      personalCode: users.personalCode,
      role: users.role,
      tier: users.tier,
      createdAt: users.createdAt,
      downloads: count(downloads.id),
    })
    .from(users)
    .leftJoin(downloads, eq(downloads.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">משתמשות</h2>
        <span className="chip bg-blue-soft text-blue-deep">{rows.length}</span>
      </div>
      <div className="card p-3 sm:p-5 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-muted text-sm">אין עדיין משתמשות רשומות.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <th className="py-2 pe-3 font-medium">שם</th>
                <th className="py-2 pe-3 font-medium">מייל</th>
                <th className="py-2 pe-3 font-medium">מספר אישי</th>
                <th className="py-2 pe-3 font-medium">הצטרפות</th>
                <th className="py-2 pe-3 font-medium">הורדות</th>
                <th className="py-2 pe-3 font-medium">תפקיד / דרגה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-foreground/5 align-top">
                  <td className="py-2 pe-3 font-semibold">
                    {u.name}
                    {u.role === "admin" && (
                      <span className="chip bg-oak-soft text-oak-deep ms-2">מנהלת</span>
                    )}
                  </td>
                  <td className="py-2 pe-3" dir="ltr">
                    {u.email}
                    <Link
                      href={`/admin/mail?to=${encodeURIComponent(u.email)}`}
                      className="ms-2 text-xs text-blue-deep hover:underline"
                      title="שליחת מייל"
                    >
                      ✉
                    </Link>
                  </td>
                  <td className="py-2 pe-3 font-mono" dir="ltr">
                    {u.personalCode}
                  </td>
                  <td className="py-2 pe-3 whitespace-nowrap">
                    {u.createdAt.toLocaleDateString("he-IL")}
                  </td>
                  <td className="py-2 pe-3">{u.downloads}</td>
                  <td className="py-2 pe-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="chip"
                        style={{
                          background: TIERS[u.tier].color + "22",
                          color: TIERS[u.tier].color,
                        }}
                      >
                        {TIERS[u.tier].icon} {TIERS[u.tier].label}
                      </span>
                    </div>
                    <UserRoleForm id={u.id} role={u.role} tier={u.tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
