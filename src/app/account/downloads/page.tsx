import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { downloads, materials, categories, type Category } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { chainToHref } from "@/lib/data";
import { MATERIAL_KINDS } from "@/lib/constants";
import { type SP, sp1, spInt, parseDate, fmtDateTime } from "@/lib/admin-analytics";
import { Pagination, Th, Td, EmptyRow } from "@/components/admin/analytics-ui";

export const metadata: Metadata = { title: "היסטוריית הורדות" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

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

export default async function AccountDownloadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/downloads");

  const sp = await searchParams;
  const materialQ = sp1(sp, "material").trim();
  const fromQ = sp1(sp, "from");
  const toQ = sp1(sp, "to");
  const page = Math.max(1, spInt(sp, "page", 1));
  const params = { material: materialQ, from: fromQ, to: toQ };

  const conds: SQL[] = [eq(downloads.userId, user.id)];
  if (materialQ) conds.push(ilike(materials.title, `%${materialQ}%`));
  const from = parseDate(fromQ);
  const to = parseDate(toQ, true);
  if (from) conds.push(gte(downloads.createdAt, from));
  if (to) conds.push(lte(downloads.createdAt, to));
  const where = and(...conds);

  const [rows, [totalRow], cats] = await Promise.all([
    db
      .select({
        id: downloads.id,
        createdAt: downloads.createdAt,
        via: downloads.via,
        materialId: materials.id,
        materialTitle: materials.title,
        kind: materials.kind,
        categoryId: materials.categoryId,
      })
      .from(downloads)
      .innerJoin(materials, eq(downloads.materialId, materials.id))
      .where(where)
      .orderBy(desc(downloads.createdAt), desc(downloads.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ n: count() })
      .from(downloads)
      .innerJoin(materials, eq(downloads.materialId, materials.id))
      .where(where),
    db.select().from(categories),
  ]);

  const byId = new Map<number, Category>(cats.map((c) => [c.id, c]));
  const total = Number(totalRow?.n ?? 0);

  const VIA_LABEL: Record<string, string> = {
    admin: "מנהלת",
    single: "רכישה בודדת",
    bundle: "קובץ מורחב",
    subscription: "מנוי",
    free: "חינם",
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/account" className="text-sm text-blue-deep hover:underline">
          ← האזור האישי
        </Link>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Download className="h-5 w-5 text-pink" /> היסטוריית הורדות
        </h1>
        <span className="chip bg-oak-soft text-oak-deep">{total.toLocaleString("he-IL")} הורדות</span>
      </div>

      <form className="card p-4 grid gap-3 sm:grid-cols-4 items-end text-sm" method="get">
        <label className="grid gap-1">
          <span className="text-xs text-muted">חיפוש לפי שם קובץ</span>
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
          <button className="btn btn-ghost !py-1.5 !px-4 text-sm">סינון</button>
          <Link href="/account/downloads" className="btn btn-ghost !py-1.5 !px-3 text-sm">
            איפוס
          </Link>
        </div>
      </form>

      <section className="card p-3 sm:p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-right">
            <tr>
              <Th>זמן</Th>
              <Th>חומר</Th>
              <Th>דרך</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow cols={4} text="אין הורדות תואמות." />
            ) : (
              rows.map((r) => {
                const chain = chainOf(byId, r.categoryId);
                const kind = MATERIAL_KINDS[r.kind];
                return (
                  <tr key={r.id} className="border-t border-foreground/5">
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                    <Td className="max-w-[360px]">
                      <Link href={chainToHref(chain)} className="text-blue-deep hover:underline font-medium">
                        {kind?.icon} {r.materialTitle}
                      </Link>
                      {chain.length > 0 && (
                        <div className="text-xs text-muted truncate">{chain.map((c) => c.title).join(" › ")}</div>
                      )}
                    </Td>
                    <Td>{r.via ? <span className="chip bg-foreground/5">{VIA_LABEL[r.via] ?? r.via}</span> : "—"}</Td>
                    <Td>
                      <a href={`/api/download/${r.materialId}`} className="btn btn-ghost text-xs py-1.5 px-3">
                        <Download className="h-3.5 w-3.5" /> הורידי שוב
                      </a>
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
    </div>
  );
}
