import { requireAdminPage } from "@/lib/session";
import Link from "next/link";
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, downloads, materials, users, type Category } from "@/db/schema";
import { chainToHref } from "@/lib/data";
import { MATERIAL_KINDS } from "@/lib/constants";
import { type SP, sp1, spInt, parseDate, startOfToday, daysAgo, fmtDateTime, qs } from "@/lib/admin-analytics";
import { StatTile, Pagination, Th, Td, EmptyRow, TopList } from "@/components/admin/analytics-ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const VIA_LABEL: Record<string, { label: string; tone: string }> = {
  admin: { label: "מנהלת", tone: "bg-oak-soft text-oak-deep" },
  single: { label: "רכישה בודדת", tone: "bg-blue-soft text-blue-deep" },
  bundle: { label: "קובץ מורחב", tone: "bg-pink-soft text-pink" },
  subscription: { label: "מנוי", tone: "bg-gold-soft text-gold" },
  free: { label: "חינם", tone: "bg-emerald-50 text-emerald-700" },
};

function chainOf(byId: Map<number, Category>, id: number | null): Category[] {
  const out: Category[] = [];
  let cur = id;
  let guard = 0;
  while (cur !== null && guard++ < 20) {
    const c = byId.get(cur);
    if (!c) break;
    out.unshift(c);
    cur = c.parentId;
  }
  return out;
}

export default async function AdminDownloadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const userQ = sp1(sp, "user").trim();
  const materialQ = sp1(sp, "material").trim();
  const fromQ = sp1(sp, "from");
  const toQ = sp1(sp, "to");
  const page = Math.max(1, spInt(sp, "page", 1));
  const params = { user: userQ, material: materialQ, from: fromQ, to: toQ };

  const conds: SQL[] = [];
  if (/^\d+$/.test(userQ)) conds.push(eq(downloads.userId, Number(userQ)));
  else if (userQ)
    conds.push(
      or(ilike(users.email, `%${userQ}%`), ilike(users.name, `%${userQ}%`), ilike(users.personalCode, `%${userQ}%`))!,
    );
  if (/^\d+$/.test(materialQ)) conds.push(eq(downloads.materialId, Number(materialQ)));
  else if (materialQ) conds.push(ilike(materials.title, `%${materialQ}%`));
  const from = parseDate(fromQ);
  const to = parseDate(toQ, true);
  if (from) conds.push(gte(downloads.createdAt, from));
  if (to) conds.push(lte(downloads.createdAt, to));
  const where = conds.length ? and(...conds) : undefined;

  const today = startOfToday();
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);

  const base = () =>
    db
      .select({ n: count() })
      .from(downloads)
      .innerJoin(users, eq(downloads.userId, users.id))
      .innerJoin(materials, eq(downloads.materialId, materials.id));

  const [rows, [totalRow], [cToday], [c7], [c30], [cAll], top, cats] = await Promise.all([
    db
      .select({
        id: downloads.id,
        createdAt: downloads.createdAt,
        via: downloads.via,
        ip: downloads.ip,
        watermark: downloads.watermark,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        personalCode: users.personalCode,
        materialId: materials.id,
        materialTitle: materials.title,
        kind: materials.kind,
        categoryId: materials.categoryId,
      })
      .from(downloads)
      .innerJoin(users, eq(downloads.userId, users.id))
      .innerJoin(materials, eq(downloads.materialId, materials.id))
      .where(where)
      .orderBy(desc(downloads.createdAt), desc(downloads.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    base().where(where),
    db.select({ n: count() }).from(downloads).where(gte(downloads.createdAt, today)),
    db.select({ n: count() }).from(downloads).where(gte(downloads.createdAt, d7)),
    db.select({ n: count() }).from(downloads).where(gte(downloads.createdAt, d30)),
    db.select({ n: count() }).from(downloads),
    db
      .select({ id: materials.id, title: materials.title, categoryId: materials.categoryId, n: count(downloads.id) })
      .from(downloads)
      .innerJoin(materials, eq(downloads.materialId, materials.id))
      .groupBy(materials.id)
      .orderBy(desc(count(downloads.id)))
      .limit(10),
    db.select().from(categories),
  ]);

  const byId = new Map<number, Category>(cats.map((c) => [c.id, c]));
  const total = Number(totalRow?.n ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">היסטוריית הורדות</h2>
        <span className="chip bg-oak-soft text-oak-deep">{total.toLocaleString("he-IL")} רשומות</span>
        <Link href="/admin/downloads/calendar" className="btn btn-ghost !py-1.5 !px-3 text-xs ms-auto">
          לוח שנה עברי
        </Link>
        <a href={`/admin/downloads/export${qs(params)}`} className="btn btn-ghost !py-1.5 !px-3 text-xs">
          ייצוא CSV
        </a>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatTile label="היום" value={Number(cToday?.n ?? 0).toLocaleString("he-IL")} tone="bg-gold-soft text-gold" />
        <StatTile label="7 ימים" value={Number(c7?.n ?? 0).toLocaleString("he-IL")} tone="bg-blue-soft text-blue-deep" />
        <StatTile label="30 יום" value={Number(c30?.n ?? 0).toLocaleString("he-IL")} tone="bg-pink-soft text-pink" />
        <StatTile label="סה״כ" value={Number(cAll?.n ?? 0).toLocaleString("he-IL")} />
      </div>

      <form className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end text-sm" method="get">
        <label className="grid gap-1">
          <span className="text-xs text-muted">משתמשת (מזהה / מייל / שם / מספר אישי)</span>
          <input name="user" defaultValue={userQ} className="input !py-1.5" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">חומר (מזהה / כותרת)</span>
          <input name="material" defaultValue={materialQ} className="input !py-1.5" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">מתאריך</span>
          <input type="date" name="from" defaultValue={fromQ} className="input !py-1.5" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">עד תאריך</span>
          <input type="date" name="to" defaultValue={toQ} className="input !py-1.5" />
        </label>
        <div className="flex gap-2">
          <button className="btn btn-oak !py-1.5 !px-4 text-sm">סינון</button>
          <Link href="/admin/downloads" className="btn btn-ghost !py-1.5 !px-3 text-sm">
            איפוס
          </Link>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <section className="card p-3 sm:p-5 overflow-x-auto min-w-0">
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <Th>זמן</Th>
                <Th>משתמשת</Th>
                <Th>חומר</Th>
                <Th>דרך</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow cols={5} text="אין הורדות תואמות." />
              ) : (
                rows.map((r) => {
                  const chain = chainOf(byId, r.categoryId);
                  const via = r.via ? VIA_LABEL[r.via] ?? { label: r.via, tone: "bg-foreground/5" } : null;
                  const kind = MATERIAL_KINDS[r.kind];
                  return (
                    <tr key={r.id} className="border-t border-foreground/5">
                      <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                      <Td>
                        <Link href={`/admin/downloads?user=${r.userId}`} className="font-semibold hover:underline">
                          {r.userName}
                        </Link>
                        <div className="text-xs text-muted" dir="ltr">
                          {r.userEmail} · <span className="font-mono">{r.personalCode}</span>
                        </div>
                      </Td>
                      <Td className="max-w-[320px]">
                        <Link
                          href={`/admin/materials?category=${r.categoryId}`}
                          className="text-blue-deep hover:underline font-medium"
                        >
                          {kind?.icon} {r.materialTitle}
                        </Link>
                        {chain.length > 0 && (
                          <div className="text-xs text-muted truncate">
                            <Link href={chainToHref(chain)} className="hover:underline" target="_blank">
                              {chain.map((c) => c.title).join(" › ")}
                            </Link>
                          </div>
                        )}
                      </Td>
                      <Td>{via ? <span className={`chip ${via.tone}`}>{via.label}</span> : <span className="text-muted">—</span>}</Td>
                      <Td className="font-mono text-xs" dir="ltr">
                        {r.ip ?? "—"}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div className="mt-4">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={params} />
          </div>
        </section>

        <aside className="card p-5">
          <h3 className="font-bold mb-3">החומרים המורדים ביותר</h3>
          <TopList
            color="var(--gold)"
            items={top.map((t) => ({
              key: t.id,
              value: Number(t.n),
              label: (
                <Link href={`/admin/downloads?material=${t.id}`} className="hover:underline">
                  {t.title}
                </Link>
              ),
              sub: chainOf(byId, t.categoryId)
                .map((c) => c.title)
                .join(" › "),
            }))}
          />
        </aside>
      </div>
    </div>
  );
}
