import { requireAdminPage } from "@/lib/session";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { formatPrice, MATERIAL_KINDS, PLANS } from "@/lib/constants";
import type { MaterialKind, Plan } from "@/db/schema";
import { type SP, spInt, daysAgo, startOfToday } from "@/lib/admin-analytics";
import { StatTile, BarChart, LineChart, TopList, type Point } from "@/components/admin/analytics-ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

async function q<T = Row>(query: ReturnType<typeof sql>): Promise<T[]> {
  try {
    const r = await db.execute(query);
    return (r.rows ?? []) as T[];
  } catch (e) {
    console.error("[stats] query failed", e);
    return [];
  }
}
async function one(query: ReturnType<typeof sql>, key = "n"): Promise<number> {
  const rows = await q(query);
  return num(rows[0]?.[key]);
}

/** ממלא סדרה יומית עם אפסים */
function fillDays(days: number, rows: Row[], keyDay = "d", keyVal = "n"): Point[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(String(r[keyDay]).slice(0, 10), num(r[keyVal]));
  const out: Point[] = [];
  const start = startOfToday();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start.getTime() - i * 86400000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: map.get(iso) ?? 0 });
  }
  return out;
}

const dayExpr = (col: string) => sql.raw(`to_char(date_trunc('day', ${col}), 'YYYY-MM-DD')`);

export default async function AdminStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const daysRaw = spInt(sp, "days", 30);
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const since = daysAgo(days);
  const today = startOfToday();
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);

  const [
    usersTotal,
    usersNew7,
    usersNew30,
    dlToday,
    dl7,
    dl30,
    views7,
    revenue30,
    activeSubs,
    premiumUsers,
    buyers,
    dlByDay,
    usersByDay,
    revByDay,
    viewsByDay,
    bySubject,
    byKind,
    topMaterials,
    topUsers,
    byPlan,
  ] = await Promise.all([
    one(sql`SELECT count(*)::int n FROM users`),
    one(sql`SELECT count(*)::int n FROM users WHERE created_at >= ${d7}`),
    one(sql`SELECT count(*)::int n FROM users WHERE created_at >= ${d30}`),
    one(sql`SELECT count(*)::int n FROM downloads WHERE created_at >= ${today}`),
    one(sql`SELECT count(*)::int n FROM downloads WHERE created_at >= ${d7}`),
    one(sql`SELECT count(*)::int n FROM downloads WHERE created_at >= ${d30}`),
    one(sql`SELECT count(*)::int n FROM page_views WHERE created_at >= ${d7}`),
    one(
      sql`SELECT coalesce(sum(amount),0)::bigint n FROM transactions WHERE type IN ('charge','manual') AND created_at >= ${d30}`,
    ),
    one(
      sql`SELECT count(*)::int n FROM purchases WHERE status = 'active' AND (ends_at IS NULL OR ends_at > now()) AND plan IN ('subject_monthly','custom_monthly','yearly')`,
    ),
    one(
      sql`SELECT count(DISTINCT user_id)::int n FROM purchases WHERE premium = true AND status = 'active' AND (ends_at IS NULL OR ends_at > now())`,
    ),
    one(sql`SELECT count(DISTINCT user_id)::int n FROM purchases`),
    q(sql`SELECT ${dayExpr("created_at")} d, count(*)::int n FROM downloads WHERE created_at >= ${since} GROUP BY 1`),
    q(sql`SELECT ${dayExpr("created_at")} d, count(*)::int n FROM users WHERE created_at >= ${since} GROUP BY 1`),
    q(
      sql`SELECT ${dayExpr("created_at")} d, coalesce(sum(amount),0)::bigint n FROM transactions WHERE type IN ('charge','manual') AND created_at >= ${since} GROUP BY 1`,
    ),
    q(sql`SELECT ${dayExpr("created_at")} d, count(*)::int n FROM page_views WHERE created_at >= ${since} GROUP BY 1`),
    q(sql`
      WITH RECURSIVE tree AS (
        SELECT id, id AS root_id, title AS root_title FROM categories WHERE parent_id IS NULL
        UNION ALL
        SELECT c.id, t.root_id, t.root_title FROM categories c JOIN tree t ON c.parent_id = t.id
      )
      SELECT t.root_id, t.root_title, count(d.id)::int n
      FROM downloads d
      JOIN materials m ON m.id = d.material_id
      JOIN tree t ON t.id = m.category_id
      WHERE d.created_at >= ${since}
      GROUP BY 1, 2 ORDER BY n DESC LIMIT 15
    `),
    q(sql`
      SELECT m.kind, count(d.id)::int n FROM downloads d JOIN materials m ON m.id = d.material_id
      WHERE d.created_at >= ${since} GROUP BY 1 ORDER BY n DESC
    `),
    q(sql`
      SELECT m.id, m.title, m.category_id, count(d.id)::int n FROM downloads d JOIN materials m ON m.id = d.material_id
      WHERE d.created_at >= ${since} GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 10
    `),
    q(sql`
      SELECT u.id, u.name, u.email, count(d.id)::int n FROM downloads d JOIN users u ON u.id = d.user_id
      WHERE d.created_at >= ${since} GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 10
    `),
    q(sql`
      SELECT plan, count(*)::int n, coalesce(sum(amount),0)::bigint total FROM purchases
      WHERE created_at >= ${since} GROUP BY 1 ORDER BY n DESC
    `),
  ]);

  const conversion = usersTotal > 0 ? Math.round((1000 * buyers) / usersTotal) / 10 : 0;
  const money = (n: number) => formatPrice(n);
  const rangeLabel = `${days} ימים אחרונים`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">סטטיסטיקות</h2>
        <div className="ms-auto flex items-center gap-1 text-sm">
          <span className="text-muted text-xs me-1">טווח:</span>
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/admin/stats?days=${d}`}
              className={`chip ${d === days ? "bg-oak text-white" : "bg-oak-soft text-oak-deep hover:bg-oak/20"}`}
            >
              {d} ימים
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
        <StatTile label="משתמשות" value={usersTotal.toLocaleString("he-IL")} hint={`+${usersNew7} השבוע · +${usersNew30} החודש`} tone="bg-blue-soft text-blue-deep" href="/admin/users" />
        <StatTile label="הורדות היום" value={dlToday.toLocaleString("he-IL")} hint={`${dl7} בשבוע · ${dl30} בחודש`} tone="bg-gold-soft text-gold" href="/admin/downloads" />
        <StatTile label="צפיות בדפים (7 ימים)" value={views7.toLocaleString("he-IL")} tone="bg-pink-soft text-pink" href="/admin/activity" />
        <StatTile label="הכנסות 30 יום" value={money(revenue30)} tone="bg-emerald-50 text-emerald-700" href="/admin/finance" />
        <StatTile label="מנויים פעילים" value={activeSubs.toLocaleString("he-IL")} hint={`${premiumUsers} עם פרימיום`} href="/admin/subscriptions" />
        <StatTile label="המרה" value={`${conversion}%`} hint={`${buyers} רכשו מתוך ${usersTotal}`} tone="bg-violet-50 text-violet-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="font-bold mb-2">הורדות לפי יום <span className="text-muted text-xs font-normal">({rangeLabel})</span></h3>
          <BarChart data={fillDays(days, dlByDay)} color="var(--gold)" />
        </section>
        <section className="card p-5">
          <h3 className="font-bold mb-2">משתמשות חדשות לפי יום <span className="text-muted text-xs font-normal">({rangeLabel})</span></h3>
          <BarChart data={fillDays(days, usersByDay)} color="var(--blue)" />
        </section>
        <section className="card p-5">
          <h3 className="font-bold mb-2">הכנסות לפי יום <span className="text-muted text-xs font-normal">({rangeLabel})</span></h3>
          <LineChart data={fillDays(days, revByDay).map((p) => ({ ...p, value: p.value / 100 }))} color="#059669" format={(n) => `₪${n.toLocaleString("he-IL")}`} />
        </section>
        <section className="card p-5">
          <h3 className="font-bold mb-2">צפיות בדפים לפי יום <span className="text-muted text-xs font-normal">({rangeLabel})</span></h3>
          <LineChart data={fillDays(days, viewsByDay)} color="var(--pink)" />
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="card p-5">
          <h3 className="font-bold mb-3">הורדות לפי מקצוע</h3>
          <TopList
            items={bySubject.map((r) => ({
              key: String(r.root_id),
              value: num(r.n),
              label: (
                <Link href={`/admin/materials?category=${r.root_id}`} className="hover:underline">
                  {String(r.root_title)}
                </Link>
              ),
            }))}
          />
        </section>
        <section className="card p-5">
          <h3 className="font-bold mb-3">הורדות לפי סוג חומר</h3>
          <TopList
            color="var(--pink)"
            items={byKind.map((r) => {
              const k = MATERIAL_KINDS[r.kind as MaterialKind];
              return { key: String(r.kind), value: num(r.n), label: k ? `${k.icon} ${k.label}` : String(r.kind) };
            })}
          />
        </section>
        <section className="card p-5">
          <h3 className="font-bold mb-3">רכישות לפי מסלול</h3>
          <TopList
            color="#059669"
            items={byPlan.map((r) => {
              const p = PLANS[r.plan as Plan];
              return {
                key: String(r.plan),
                value: num(r.n),
                label: p?.label ?? String(r.plan),
                sub: `סה״כ ${money(num(r.total))}`,
              };
            })}
          />
        </section>
        <section className="card p-5">
          <h3 className="font-bold mb-3">10 החומרים המובילים</h3>
          <TopList
            color="var(--gold)"
            items={topMaterials.map((r) => ({
              key: String(r.id),
              value: num(r.n),
              label: (
                <Link href={`/admin/downloads?material=${r.id}`} className="hover:underline">
                  {String(r.title)}
                </Link>
              ),
            }))}
          />
        </section>
        <section className="card p-5">
          <h3 className="font-bold mb-3">10 המשתמשות המורידות ביותר</h3>
          <TopList
            color="var(--blue)"
            items={topUsers.map((r) => ({
              key: String(r.id),
              value: num(r.n),
              label: (
                <Link href={`/admin/downloads?user=${r.id}`} className="hover:underline">
                  {String(r.name)}
                </Link>
              ),
              sub: <span dir="ltr">{String(r.email)}</span>,
            }))}
          />
        </section>
      </div>
    </div>
  );
}
