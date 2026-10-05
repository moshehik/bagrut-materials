import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { formatPrice } from "@/lib/constants";
import { type SP, sp1, spInt, parseDate } from "@/lib/admin-analytics";
import { formatHebrewDate } from "@/lib/hebrew-date";
import { HebrewDateField } from "@/components/hebrew-date-field";
import { Pagination } from "@/components/admin/analytics-ui";
import { BackButton } from "@/components/account-ui";

export const metadata: Metadata = { title: "היסטוריית תשלומים" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const TX_TYPE_LABEL: Record<string, string> = {
  charge: "חיוב",
  refund: "זיכוי",
  manual: "ידני",
  adjustment: "התאמה",
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
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
        <div>
          <h1 className="text-4xl md:text-5xl">היסטוריית תשלומים</h1>
          <p className="mt-2 max-w-md">{total.toLocaleString("he-IL")} תנועות.</p>
          <BackButton />
        </div>
      </div>

      <section className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8" aria-label="סינון">
        <span className="gold-ring" aria-hidden="true" />
        <form className="space-y-4" method="get">
          <div className="grid gap-4 sm:grid-cols-2">
            <HebrewDateField name="from" label="מתאריך" defaultValue={fromQ} />
            <HebrewDateField name="to" label="עד תאריך" defaultValue={toQ} />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-gold btn-gate py-1.5">סינון</button>
            <Link href="/account/payments" className="btn gate-skip py-1.5">
              איפוס
            </Link>
          </div>
        </form>
      </section>

      <section className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8" aria-label="התנועות">
        <span className="gold-ring" aria-hidden="true" />
        {rows.length === 0 ? (
          <p className="gate-card py-6 text-center text-xl">אין תנועות כספיות.</p>
        ) : (
          <ul className="acc-list gate-card !py-2">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span className="gate-badge">{TX_TYPE_LABEL[t.type] ?? t.type}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg">{t.note ?? t.reference ?? "—"}</p>
                  <p className="gate-soft text-base">
                    {formatHebrewDate(t.createdAt, true)}
                    {t.method ? ` · ${t.method}` : ""}
                  </p>
                </div>
                <span className={`whitespace-nowrap text-xl ${t.amount < 0 ? "text-[#1b5e20]" : ""}`}>
                  {t.amount < 0 ? "-" : ""}
                  {formatPrice(Math.abs(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 text-white [&_.text-muted]:text-white/80">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={params} />
        </div>
      </section>
    </div>
  );
}
