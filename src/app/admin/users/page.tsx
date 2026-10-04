import Link from "next/link";
import { count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Search } from "lucide-react";
import { db } from "@/db";
import { users, downloads } from "@/db/schema";
import { UserRoleForm } from "@/components/admin/user-role-form";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function fmtDateTime(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const me = await getCurrentUser();

  let where: SQL | undefined;
  if (q) {
    const like = `%${q}%`;
    where = or(ilike(users.name, like), ilike(users.email, like), ilike(users.personalCode, like));
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      personalCode: users.personalCode,
      role: users.role,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      googleId: users.googleId,
      suspended: users.suspended,
      suspendReason: users.suspendReason,
      dailyDownloadLimit: users.dailyDownloadLimit,
      notes: users.notes,
      emailVerified: users.emailVerified,
      downloads: count(downloads.id),
    })
    .from(users)
    .leftJoin(downloads, eq(downloads.userId, users.id))
    .where(where)
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(500);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">משתמשות</h2>
        <span className="chip bg-blue-soft text-blue-deep">
          {q ? `${rows.length} מתוך ${total}` : total}
        </span>
        <form className="ms-auto flex items-center gap-2" action="/admin/users">
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 end-2.5 h-4 w-4 text-muted pointer-events-none" />
            <input
              name="q"
              defaultValue={q}
              placeholder="חיפוש שם / מייל / מספר אישי"
              className="input py-1.5 text-sm w-64 pe-8"
            />
          </div>
          <button className="btn btn-oak text-xs py-1.5">חיפוש</button>
          {q && (
            <Link href="/admin/users" className="btn btn-ghost text-xs py-1.5">
              ניקוי
            </Link>
          )}
        </form>
      </div>
      <div className="card p-3 sm:p-5 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-muted text-sm">
            {q ? "לא נמצאו משתמשות התואמות לחיפוש." : "אין עדיין משתמשות רשומות."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <th className="py-2 pe-3 font-medium">שם</th>
                <th className="py-2 pe-3 font-medium">מייל</th>
                <th className="py-2 pe-3 font-medium">מספר אישי</th>
                <th className="py-2 pe-3 font-medium">הצטרפות</th>
                <th className="py-2 pe-3 font-medium">נראתה לאחרונה</th>
                <th className="py-2 pe-3 font-medium">הורדות</th>
                <th className="py-2 pe-3 font-medium">תפקיד / דרגה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  className={`border-t border-foreground/5 align-top ${u.suspended ? "bg-red-50/40" : ""}`}
                >
                  <td className="py-2 pe-3 font-semibold">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.name}
                      {u.role === "admin" && (
                        <span className="chip bg-oak-soft text-oak-deep">מנהלת</span>
                      )}
                      {u.googleId && (
                        <span className="chip bg-blue-soft text-blue-deep" title="נרשמה עם גוגל">
                          Google
                        </span>
                      )}
                      {u.suspended && (
                        <span className="chip bg-red-100 text-red-700" title={u.suspendReason ?? ""}>
                          מושהית
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-normal">
                      <Link href={`/admin/activity?user=${u.id}`} className="text-blue-deep hover:underline">
                        צפייה בפעילות
                      </Link>
                      <Link href={`/admin/subscriptions?user=${u.id}`} className="text-blue-deep hover:underline">
                        מנויים
                      </Link>
                      <Link href={`/admin/finance?user=${u.id}`} className="text-blue-deep hover:underline">
                        תנועות
                      </Link>
                    </div>
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
                  <td className="py-2 pe-3 whitespace-nowrap text-xs">{fmtDateTime(u.lastSeenAt)}</td>
                  <td className="py-2 pe-3">
                    {u.downloads}
                    {u.dailyDownloadLimit !== null && (
                      <span className="block text-[11px] text-muted">מגבלה: {u.dailyDownloadLimit}/יום</span>
                    )}
                  </td>
                  <td className="py-2 pe-3 min-w-[260px]">
                    <UserRoleForm
                      id={u.id}
                      role={u.role}
                      dailyDownloadLimit={u.dailyDownloadLimit}
                      notes={u.notes}
                      suspended={u.suspended}
                      suspendReason={u.suspendReason}
                      isSelf={me?.id === u.id}
                    />
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
