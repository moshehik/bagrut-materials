import { requireAdminPage } from "@/lib/session";
import { and, countDistinct, desc, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pageViews, users } from "@/db/schema";
import { shortUA } from "@/lib/ua";
import { loadPathLabeler } from "@/lib/path-labels";
import { getNumber } from "@/lib/settings";
import { agoText, minutesAgo } from "@/lib/admin-analytics";
import { StatTile, Th, Td, EmptyRow, TipLink } from "@/components/admin/analytics-ui";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { DT } from "@/components/admin/date-tip";

export const dynamic = "force-dynamic";

export default async function AdminOnlinePage() {
  await requireAdminPage();
  const windowMin = Math.max(1, await getNumber("online_window_minutes"));
  const since = minutesAgo(windowMin);

  const [online, [anon], guestRows, labelOf] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
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
    // אורחות (לא מחוברות) בחלון הזמן – הצפיות האחרונות; מקבצים לפי IP למטה
    db
      .select({
        ip: pageViews.ip,
        sessionId: pageViews.sessionId,
        path: pageViews.path,
        userAgent: pageViews.userAgent,
        createdAt: pageViews.createdAt,
      })
      .from(pageViews)
      .where(and(gte(pageViews.createdAt, since), isNull(pageViews.userId)))
      .orderBy(desc(pageViews.createdAt))
      .limit(2000),
    loadPathLabeler(),
  ]);

  type Guest = { ip: string; views: number; sessions: Set<string>; lastPath: string; userAgent: string | null; lastAt: Date };
  const guestMap = new Map<string, Guest>();
  for (const r of guestRows) {
    const key = r.ip ?? "—";
    const g = guestMap.get(key);
    if (g) {
      g.views++;
      if (r.sessionId) g.sessions.add(r.sessionId);
    } else {
      guestMap.set(key, { ip: key, views: 1, sessions: new Set(r.sessionId ? [r.sessionId] : []), lastPath: r.path, userAgent: r.userAgent, lastAt: r.createdAt });
    }
  }
  const guests = [...guestMap.values()];

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
        <StatTile label="אורחות (גולשות שלא התחברו)" value={anonCount} tone="bg-blue-soft text-blue-deep" />
        <StatTile label="סה״כ פעילות" value={online.length + anonCount} />
      </div>

      <section className="card p-3 sm:p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-right">
            <tr>
              <Th>שם</Th>
              <Th>מייל</Th>
              <Th>תפקיד</Th>
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
                  <Td className="font-semibold">{u.name}</Td>
                  <Td dir="ltr">{u.email}</Td>
                  <Td>
                    <span className={`chip ${u.role === "admin" ? "bg-oak-soft text-oak-deep" : "bg-foreground/5 text-muted"}`}>
                      {u.role === "admin" ? "מנהלת" : "משתמשת"}
                    </span>
                    {u.suspended && <span className="chip bg-red-50 text-red-700 ms-2">מושהית</span>}
                  </Td>
                  <Td>{u.lastPath ? <TipLink href={u.lastPath} newTab /> : "—"}</Td>
                  <Td dir="ltr">{u.lastIp ?? "—"}</Td>
                  <Td className="whitespace-nowrap">
                    <DT value={u.lastSeenAt} label={agoText(u.lastSeenAt)} />
                  </Td>
                  <Td>
                    <TipLink href={`/admin/activity?user=${u.id}`} tip="פעילות המשתמשת בעמוד הפעילות">
                      פעילות
                    </TipLink>
                    {" "}
                    <TipLink href={`/admin/users?q=${encodeURIComponent(u.email)}`} tip="פרטי המשתמשת בעמוד המשתמשות">
                      פרטים
                    </TipLink>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card p-3 sm:p-5 overflow-x-auto">
        <h3 className="font-bold mb-1">אורחות לפי כתובת IP</h3>
        <p className="text-xs text-muted mb-3">גולשות שלא התחברו, בחלון הזמן שלמעלה. כל שורה = כתובת IP אחת (כמה מכשירים ברשת אחת מופיעים יחד).</p>
        <table className="w-full text-sm">
          <thead className="text-muted text-right">
            <tr>
              <Th>כתובת IP</Th>
              <Th>צפיות בדפים</Th>
              <Th>גולשות שונות</Th>
              <Th>העמוד האחרון</Th>
              <Th>דפדפן</Th>
              <Th>נראתה</Th>
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 ? (
              <EmptyRow cols={6} text="אין אורחות פעילות כרגע." />
            ) : (
              guests.map((g) => (
                <tr key={g.ip} className="border-t border-foreground/5">
                  <Td dir="ltr">{g.ip}</Td>
                  <Td className="tabular-nums">{g.views.toLocaleString("he-IL")}</Td>
                  <Td className="tabular-nums">{g.sessions.size || 1}</Td>
                  <Td>
                    <TipLink href={g.lastPath} tip={`${labelOf(g.lastPath).full}
${g.lastPath}`} newTab>
                      {labelOf(g.lastPath).short}
                    </TipLink>
                  </Td>
                  <Td className="whitespace-nowrap">{shortUA(g.userAgent)}</Td>
                  <Td className="whitespace-nowrap">
                    <DT value={g.lastAt} label={agoText(g.lastAt)} />
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
