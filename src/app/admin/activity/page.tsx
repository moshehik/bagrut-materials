import Link from "next/link";
import { and, avg, count, countDistinct, desc, eq, gte, ilike, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { pageViews, users } from "@/db/schema";
import { shortUA } from "@/lib/ua";
import {
  type SP,
  sp1,
  spInt,
  parseDate,
  startOfToday,
  daysAgo,
  fmtDateTime,
  fmtDuration,
  qs,
} from "@/lib/admin-analytics";
import { StatTile, Pagination, Th, Td, EmptyRow, TopList } from "@/components/admin/analytics-ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const userQ = sp1(sp, "user").trim();
  const pathQ = sp1(sp, "path").trim();
  const fromQ = sp1(sp, "from");
  const toQ = sp1(sp, "to");
  const onlyLoggedIn = sp1(sp, "li") === "1";
  const page = Math.max(1, spInt(sp, "page", 1));
  const params = { user: userQ, path: pathQ, from: fromQ, to: toQ, li: onlyLoggedIn ? "1" : "" };

  const userIdFilter = /^\d+$/.test(userQ) ? Number(userQ) : null;

  const conds: SQL[] = [];
  if (userIdFilter !== null) conds.push(eq(pageViews.userId, userIdFilter));
  else if (userQ) conds.push(or(ilike(users.email, `%${userQ}%`), ilike(users.name, `%${userQ}%`))!);
  if (pathQ) conds.push(ilike(pageViews.path, `%${pathQ}%`));
  const from = parseDate(fromQ);
  const to = parseDate(toQ, true);
  if (from) conds.push(gte(pageViews.createdAt, from));
  if (to) conds.push(lte(pageViews.createdAt, to));
  if (onlyLoggedIn) conds.push(isNotNull(pageViews.userId));
  const where = conds.length ? and(...conds) : undefined;

  const today = startOfToday();
  const weekAgo = daysAgo(7);

  const [rows, [totalRow], [todayRow], topPages, drillUser] = await Promise.all([
    db
      .select({
        id: pageViews.id,
        createdAt: pageViews.createdAt,
        path: pageViews.path,
        referer: pageViews.referer,
        duration: pageViews.duration,
        ip: pageViews.ip,
        userAgent: pageViews.userAgent,
        sessionId: pageViews.sessionId,
        userId: pageViews.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(pageViews)
      .leftJoin(users, eq(pageViews.userId, users.id))
      .where(where)
      .orderBy(desc(pageViews.createdAt), desc(pageViews.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(pageViews).leftJoin(users, eq(pageViews.userId, users.id)).where(where),
    db
      .select({
        views: count(),
        sessions: countDistinct(pageViews.sessionId),
        avgDur: avg(pageViews.duration),
      })
      .from(pageViews)
      .where(gte(pageViews.createdAt, today)),
    db
      .select({ path: pageViews.path, n: count() })
      .from(pageViews)
      .where(gte(pageViews.createdAt, weekAgo))
      .groupBy(pageViews.path)
      .orderBy(desc(count()))
      .limit(10),
    userIdFilter !== null
      ? db.select().from(users).where(eq(users.id, userIdFilter)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const total = Number(totalRow?.n ?? 0);
  const drillStats =
    userIdFilter !== null
      ? await db
          .select({
            views: count(),
            sessions: countDistinct(pageViews.sessionId),
            totalDur: sql<number>`coalesce(sum(${pageViews.duration}),0)::int`,
            first: sql<Date | null>`min(${pageViews.createdAt})`,
            last: sql<Date | null>`max(${pageViews.createdAt})`,
          })
          .from(pageViews)
          .where(eq(pageViews.userId, userIdFilter))
          .then((r) => r[0])
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">פעילות וגלישה</h2>
        <span className="chip bg-oak-soft text-oak-deep">{total.toLocaleString("he-IL")} רשומות</span>
        <a href={`/admin/activity/export${qs(params)}`} className="btn btn-ghost !py-1.5 !px-3 text-xs ms-auto">
          ייצוא CSV
        </a>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <StatTile label="צפיות היום" value={Number(todayRow?.views ?? 0).toLocaleString("he-IL")} />
        <StatTile
          label="סשנים ייחודיים היום"
          value={Number(todayRow?.sessions ?? 0).toLocaleString("he-IL")}
          tone="bg-blue-soft text-blue-deep"
        />
        <StatTile label="משך ממוצע היום" value={fmtDuration(Number(todayRow?.avgDur ?? 0))} tone="bg-pink-soft text-pink" />
      </div>

      {drillUser && (
        <section className="card p-5 border-oak/30 bg-oak-soft/30">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="text-xs text-muted">ציר זמן גלישה של</div>
              <div className="font-bold text-lg">
                {drillUser.name} <span className="text-muted text-sm font-normal" dir="ltr">({drillUser.email})</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs ms-auto">
              <span className="chip bg-white text-foreground/80">צפיות: {Number(drillStats?.views ?? 0)}</span>
              <span className="chip bg-white text-foreground/80">סשנים: {Number(drillStats?.sessions ?? 0)}</span>
              <span className="chip bg-white text-foreground/80">סה״כ זמן: {fmtDuration(drillStats?.totalDur)}</span>
              <span className="chip bg-white text-foreground/80">
                ראשונה: {fmtDateTime(drillStats?.first ?? null)} · אחרונה: {fmtDateTime(drillStats?.last ?? null)}
              </span>
            </div>
            <Link href="/admin/activity" className="text-xs text-blue-deep hover:underline">
              נקי סינון
            </Link>
          </div>
        </section>
      )}

      <form className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end text-sm" method="get">
        <label className="grid gap-1">
          <span className="text-xs text-muted">משתמשת (מזהה / מייל / שם)</span>
          <input name="user" defaultValue={userQ} className="input !py-1.5" placeholder="12 או dana@" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">נתיב מכיל</span>
          <input name="path" defaultValue={pathQ} className="input !py-1.5" placeholder="/subjects/" dir="ltr" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">מתאריך</span>
          <input type="date" name="from" defaultValue={fromQ} className="input !py-1.5" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">עד תאריך</span>
          <input type="date" name="to" defaultValue={toQ} className="input !py-1.5" />
        </label>
        <label className="flex items-center gap-2 py-2">
          <input type="checkbox" name="li" value="1" defaultChecked={onlyLoggedIn} className="accent-oak" />
          <span>רק מחוברות</span>
        </label>
        <div className="flex gap-2">
          <button className="btn btn-oak !py-1.5 !px-4 text-sm">סינון</button>
          <Link href="/admin/activity" className="btn btn-ghost !py-1.5 !px-3 text-sm">
            איפוס
          </Link>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
        <section className="card p-3 sm:p-5 overflow-x-auto min-w-0">
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <Th>זמן</Th>
                <Th>משתמשת</Th>
                <Th>נתיב</Th>
                <Th>משך</Th>
                <Th>מקור</Th>
                <Th>IP</Th>
                <Th>דפדפן</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow cols={7} text="אין צפיות תואמות. (הרישום פעיל רק כאשר 'רישום היסטוריית גלישה' מופעל בהגדרות)" />
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-foreground/5">
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                    <Td>
                      {r.userId ? (
                        <>
                          <Link href={`/admin/activity?user=${r.userId}`} className="font-semibold hover:underline">
                            {r.userName}
                          </Link>
                          <div className="text-xs">
                            <Link
                              href={`/admin/users?q=${encodeURIComponent(r.userEmail ?? "")}`}
                              className="text-blue-deep hover:underline"
                              dir="ltr"
                            >
                              {r.userEmail}
                            </Link>
                          </div>
                        </>
                      ) : (
                        <span className="text-muted text-xs" title={r.sessionId ?? ""}>
                          אורחת {r.sessionId ? `· ${r.sessionId.slice(0, 8)}` : ""}
                        </span>
                      )}
                    </Td>
                    <Td className="max-w-[260px]">
                      <Link href={r.path} className="text-blue-deep hover:underline break-all" dir="ltr" target="_blank">
                        {r.path}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{fmtDuration(r.duration)}</Td>
                    <Td className="max-w-[160px] truncate text-xs text-muted" title={r.referer ?? ""} dir="ltr">
                      {r.referer ? r.referer.replace(/^https?:\/\//, "").slice(0, 40) : "—"}
                    </Td>
                    <Td className="font-mono text-xs" dir="ltr">
                      {r.ip ?? "—"}
                    </Td>
                    <Td className="text-xs whitespace-nowrap" title={r.userAgent ?? ""}>
                      {shortUA(r.userAgent)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="mt-4">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={params} />
          </div>
        </section>

        <aside className="card p-5">
          <h3 className="font-bold mb-3">דפים מובילים (7 ימים)</h3>
          <TopList
            items={topPages.map((p) => ({
              key: p.path,
              value: Number(p.n),
              label: (
                <Link href={`/admin/activity?path=${encodeURIComponent(p.path)}`} className="hover:underline" dir="ltr">
                  {p.path}
                </Link>
              ),
            }))}
          />
        </aside>
      </div>
    </div>
  );
}
