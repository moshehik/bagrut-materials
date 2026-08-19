import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { Receipt } from "lucide-react";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { formatPrice } from "@/lib/constants";
import { type SP, sp1, spInt, parseDate, fmtDateTime } from "@/lib/admin-analytics";
import { Pagination, Th, Td, EmptyRow } from "@/components/admin/analytics-ui";

export const metadata: Metadata = { title: "היסטוריית תשלומים" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const TX_TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  charge: { label: "חיוב", tone: "bg-blue-soft text-blue-deep" },
  refund: { label: "זיכוי", tone: "bg-emerald-50 text-emerald-700" },
  manual: { label: "ידני", tone: "bg-oak-soft text-oak-deep" },
  adjustment: { label: "התאמה", tone: "bg-gold-soft text-gold" },
};

export default async function AccountPaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/payments");

  const sp = await searchParams;
  const fromQ = sp1(sp, "from");
  const toQ = sp1(sp, "to");
  const page = Math.max(1, spInt(sp, "page", 1));
  const params = { from: fromQ, to: toQ };

  const conds: SQL[] = [eq(transactions.userId, user.id)];
  const from = parseDate(fromQ);
  const to = parseDate(toQ, true);
  if (from) conds.push(gte(transactions.createdAt, from));
  if (to) conds.push(lte(transactions.createdAt, to));
  const where = and(...conds);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(transactions).where(where),
  ]);
  const total = Number(totalRow?.n ?? 0);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/account" className="text-sm text-blue-deep hover:underline">
          ← האזור האישי
        </Link>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Receipt className="h-5 w-5 text-gold" /> היסטוריית תשלומים
        </h1>
        <span className="chip bg-oak-soft text-oak-deep">{total.toLocaleString("he-IL")} תנועות</span>
      </div>

      <form className="card p-4 grid gap-3 sm:grid-cols-3 items-end text-sm" method="get">
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
          <Link href="/account/payments" className="btn btn-ghost !py-1.5 !px-3 text-sm">
            איפוס
          </Link>
        </div>
      </form>

      <section className="card p-3 sm:p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-right">
            <tr>
              <Th>תאריך</Th>
              <Th>סוג</Th>
              <Th>פירוט</Th>
              <Th>אמצעי</Th>
              <Th>סכום</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow cols={5} text="אין תנועות כספיות." />
            ) : (
              rows.map((t) => {
                const type = TX_TYPE_LABEL[t.type] ?? { label: t.type, tone: "bg-foreground/5" };
                return (
                  <tr key={t.id} className="border-t border-foreground/5">
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(t.createdAt)}</Td>
                    <Td>
                      <span className={`chip ${type.tone}`}>{type.label}</span>
                    </Td>
                    <Td className="max-w-[280px] truncate">{t.note ?? t.reference ?? "—"}</Td>
                    <Td>{t.method ?? "—"}</Td>
                    <Td className={`whitespace-nowrap font-semibold ${t.amount < 0 ? "text-emerald-700" : ""}`}>
                      {t.amount < 0 ? "-" : ""}
                      {formatPrice(Math.abs(t.amount))}
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
