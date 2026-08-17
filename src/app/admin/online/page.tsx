import Link from "next/link";
import { and, countDistinct, desc, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pageViews, users } from "@/db/schema";
import { getNumber } from "@/lib/settings";
import { TIERS } from "@/lib/constants";
import { agoText, fmtDateTime, minutesAgo } from "@/lib/admin-analytics";
import { StatTile, Th, Td, EmptyRow } from "@/components/admin/analytics-ui";
import { AutoRefresh } from "@/components/admin/auto-refresh";

export const dynamic = "force-dynamic";

export default async function AdminOnlinePage() {
  const windowMin = Math.max(1, await getNumber("online_window_minutes"));
  const since = minutesAgo(windowMin);

  const [online, [anon]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        tier: users.tier,
        lastSeenAt: users.lastSeenAt,
        lastPath: users.lastPath,
        lastIp: users.lastIp,
        suspended: users.suspended,
      })
      .from(users)
      .where(gte(users.lastSeenAt, since))
      .orderBy(desc(users.lastSeenAt)),
    db
      .select({ n: countDistinct(pageViews.sessionId) })
      .from(pageViews)
      .where(and(gte(pageViews.createdAt, since), isNull(pageViews.userId))),
  ]);

  const anonCount = Number(anon?.n ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">מחוברות כעת</h2>
        <span className="chip bg-emerald-50 text-emerald-700">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
          מחוברות עכשיו: {online.length}
        </span>
        <span className="text-xs text-muted">(פעילות ב-{windowMin} הדקות האחרונות)</span>
        <div className="ms-auto">
          <AutoRefresh seconds={30} />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <StatTile label="משתמשות רשומות" value={online.length} tone="bg-emerald-50 text-emerald-700" />
        <StatTile label="אורחות (סשנים אנונימיים)" value={anonCount} tone="bg-blue-soft text-blue-deep" />
        <StatTile label="סה״כ פעילות" value={online.length + anonCount} />
      </div>

      <section className="card p-3 sm:p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-right">
            <tr>
              <Th>שם</Th>
              <Th>מייל</Th>
              <Th>דרגה</Th>
              <Th>נמצאת ב</Th>
              <Th>IP</Th>
              <Th>נראתה</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {online.length === 0 ? (
              <EmptyRow cols={7} text="אין משתמשות מחוברות כרגע." />
            ) : (
              online.map((u) => (
                <tr key={u.id} className="border-t border-foreground/5">
                  <Td className="font-semibold">
                    {u.name}
                    {u.role === "admin" && <span className="chip bg-oak-soft text-oak-deep ms-2">מנהלת</span>}
                    {u.suspended && <span className="chip bg-red-50 text-red-700 ms-2">מושהית</span>}
                  </Td>
                  <Td dir="ltr">
                    <Link href={`/admin/users?q=${encodeURIComponent(u.email)}`} className="text-blue-deep hover:underline">
                      {u.email}
                    </Link>
                  </Td>
                  <Td>
                    <span className="chip" style={{ background: TIERS[u.tier].color + "22", color: TIERS[u.tier].color }}>
                      {TIERS[u.tier].icon} {TIERS[u.tier].label}
                    </span>
                  </Td>
                  <Td className="max-w-[260px]">
                    {u.lastPath ? (
                      <Link href={u.lastPath} className="text-blue-deep hover:underline break-all" dir="ltr" target="_blank">
                        {u.lastPath}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="font-mono text-xs" dir="ltr">
                    {u.lastIp ?? "—"}
                  </Td>
                  <Td className="whitespace-nowrap" title={fmtDateTime(u.lastSeenAt)}>
                    {agoText(u.lastSeenAt)}
                  </Td>
                  <Td>
                    <Link href={`/admin/activity?user=${u.id}`} className="text-xs text-oak-deep hover:underline whitespace-nowrap">
                      צפייה בפעילות
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
