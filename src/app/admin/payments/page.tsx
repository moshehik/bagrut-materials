import Link from "next/link";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { requireAdminPage } from "@/lib/session";
import { db } from "@/db";
import { categories, nedarimPaymentEvents, nedarimPayments, nedarimTransactions, users } from "@/db/schema";
import { callbackUrl, loadNedarimConfig } from "@/lib/nedarim/config";
import { NEDARIM_STATUSES, STATUS_LABEL_HE, describeTerms, isNedarimStatus, isStaleProcessing, termsOfPayment } from "@/lib/nedarim/logic";
import { expireStale, parseCategoryIds } from "@/lib/nedarim/store";
import { SECRET_NAMES, getSecretStatus } from "@/lib/nedarim/secrets";
import { HOURLY_CALL_CAP, MAX_ROWS, SYNC_MIN_INTERVAL_SEC, countTxWithoutDate, currentHourCalls, getSyncState, listUnmatchedTransactions, nextAllowedAt } from "@/lib/nedarim/sync";
import { NedarimPaymentRow, type NedarimPaymentRowData } from "@/components/admin/nedarim-payment-row";
import { NedarimSecretsCard } from "@/components/admin/nedarim-secrets-card";
import { NedarimSyncCard } from "@/components/admin/nedarim-sync-card";
import { NedarimCategoriesCard } from "@/components/admin/nedarim-categories-card";
import { getMaxActiveCouponPercent, listCategories, planSyncStatus } from "@/lib/nedarim/groupe";
import { redactNedarim } from "@/lib/nedarim/secrets";
import type { NedarimCategory } from "@/lib/nedarim/groupe-logic";

/** מסך "תשלומים (נדרים)": מצב החיבור, שער הקריאה, סודות, כל בקשות התשלום, אישור ידני / ביטול. docs/nedarim-payments.md */
export const dynamic = "force-dynamic";

type SP = { status?: string; ref?: string; user?: string };

export default async function AdminNedarimPaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = isNedarimStatus(sp.status) ? sp.status : undefined;
  const userId = sp.user && Number.isInteger(Number(sp.user)) ? Number(sp.user) : undefined;
  const ref = sp.ref?.trim().toUpperCase();

  const [cfg, secretStatuses, syncState, unmatched, withoutDate] = await Promise.all([
    loadNedarimConfig(),
    Promise.all(SECRET_NAMES.map(getSecretStatus)),
    getSyncState(),
    listUnmatchedTransactions(30),
    countTxWithoutDate(),
  ]);
  let tablesReady = true;
  let expired = 0;
  let cachedTx = 0;
  const pageNow = new Date();
  try {
    expired = await expireStale(pageNow);
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(nedarimTransactions);
    cachedTx = Number(c?.n ?? 0);
  } catch (e) {
    tablesReady = false;
    console.error("[admin payments] nedarim tables missing?", e instanceof Error ? e.message : e);
  }

  // קטגוריות בנדרים – קריאה אחת עם טעינת הדף (בלי polling); כישלון לא מפיל את המסך
  let nedarimCategories: NedarimCategory[] = [];
  let categoriesError: string | null = null;
  const maxCoupon = await getMaxActiveCouponPercent();
  if (cfg.hasApiPassword && cfg.mosadId) {
    try {
      nedarimCategories = await listCategories();
    } catch (e) {
      categoriesError = redactNedarim(e instanceof Error ? e.message : "error").slice(0, 200);
    }
  } else {
    categoriesError = "אין מפתח API / קוד מוסד";
  }
  const syncRows = await planSyncStatus(nedarimCategories, maxCoupon);

  const conds: SQL[] = [];
  if (status) conds.push(eq(nedarimPayments.status, status));
  if (userId) conds.push(eq(nedarimPayments.userId, userId));
  if (ref) conds.push(eq(nedarimPayments.reference, ref));

  const rows = tablesReady
    ? await db
        .select({ p: nedarimPayments, userName: users.name, userEmail: users.email })
        .from(nedarimPayments)
        .innerJoin(users, eq(users.id, nedarimPayments.userId))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(nedarimPayments.createdAt))
        .limit(200)
    : [];

  const ids = rows.map((r) => r.p.id);
  const [events, roots] = await Promise.all([
    ids.length
      ? db.select().from(nedarimPaymentEvents).where(inArray(nedarimPaymentEvents.paymentId, ids)).orderBy(nedarimPaymentEvents.createdAt)
      : Promise.resolve([]),
    db.select({ id: categories.id, title: categories.title }).from(categories),
  ]);
  const titles = new Map(roots.map((r) => [r.id, r.title]));
  const evByPayment = new Map<number, typeof events>();
  for (const e of events) evByPayment.set(e.paymentId, [...(evByPayment.get(e.paymentId) ?? []), e]);

  const data: NedarimPaymentRowData[] = rows.map(({ p, userName, userEmail }) => ({
    id: p.id,
    reference: p.reference,
    status: p.status,
    plan: p.plan,
    subjectTitles: parseCategoryIds(p).map((id) => titles.get(id) ?? `#${id}`),
    subjectsPending: p.subjectsPending,
    itemTitle: p.itemTitle ?? null,
    materialId: p.materialId ?? null,
    itemCategoryId: p.itemCategoryId ?? null,
    amount: p.amount,
    listAmount: p.listAmount,
    termsText: describeTerms(termsOfPayment(p)),
    kevaId: p.kevaId ?? null,
    couponPercent: p.couponPercent,
    userId: p.userId,
    userName,
    userEmail,
    phone: p.phone,
    transactionId: p.transactionId,
    confirmation: p.confirmation,
    cardLast4: p.cardLast4,
    verified: p.verified,
    verifyMethod: p.verifyMethod,
    errorMessage: p.errorMessage,
    assistRequestedAt: p.assistRequestedAt,
    purchaseId: p.purchaseId,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    stale: isStaleProcessing(p.status, p.createdAt, pageNow),
    events: (evByPayment.get(p.id) ?? []).map((e) => ({ id: e.id, kind: e.kind, message: e.message, detail: e.detail, createdAt: e.createdAt })),
  }));

  const counts = {
    open: data.filter((d) => d.status === "pending" || d.status === "processing").length,
    manual: data.filter((d) => d.status === "processing" || (d.assistRequestedAt && d.status === "pending")).length,
    stale: data.filter((d) => d.stale).length,
    noPurchase: data.filter((d) => d.status === "paid" && !d.purchaseId).length,
  };

  const link = (patch: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/payments${s ? `?${s}` : ""}`;
  };
  const chipCls = (on: boolean) => `chip text-xs ${on ? "bg-oak text-white" : "bg-oak-soft text-oak-deep hover:bg-oak/30"}`;
  const cb = callbackUrl(cfg);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">תשלומים דרך נדרים פלוס</h2>
        <span className="chip bg-yellow-100 text-yellow-800">{counts.open} פתוחים</span>
        {counts.manual > 0 && <span className="chip bg-red-100 text-red-800">{counts.manual} ממתינים לאישור ידני</span>}
        {counts.stale > 0 && <span className="chip bg-red-100 text-red-800">{counts.stale} מעל 48 שעות</span>}
        {counts.noPurchase > 0 && <span className="chip bg-red-100 text-red-800">{counts.noPurchase} שולמו בלי מנוי</span>}
        <span className="chip bg-blue-soft text-blue-deep">{data.length} מוצגים</span>
        {expired > 0 && <span className="chip bg-gray-100 text-gray-700">{expired} פגו עכשיו</span>}
      </div>

      <div className={`card p-4 space-y-2 text-sm ${cfg.ready && !cfg.missing.length ? "" : "border border-yellow-300"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">מצב החיבור:</span>
          <span className={`chip ${cfg.ready ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>{cfg.ready ? "פעיל" : "לא פעיל"}</span>
          {cfg.simulate && <span className="chip bg-pink-soft text-pink">מצב דמה (פיתוח)</span>}
          <span className="chip bg-gray-100 text-gray-700">זיהוי אוטומטי: {cfg.hasApiPassword ? "יש מפתח API" : "אין מפתח – אישור ידני בלבד"}</span>
        </div>
        {!tablesReady && (
          <p className="text-red-700 font-semibold">
            טבלאות nedarim_* עדיין לא קיימות ב-DB – להריץ <code>npx tsx scripts/create-nedarim-tables.ts --apply</code>.
          </p>
        )}
        {cfg.missing.length > 0 && (
          <ul className="list-disc ps-5 text-muted">
            {cfg.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          הזרימה: המורה מופנית לדף התשלום של נדרים (<code dir="ltr">matara.pro/nedarimplus/online/?mosad={cfg.mosadId || "…"}</code>) עם הסכום נעול
          ומזהה הבקשה בהערה; האתר מזהה את התשלום בהיסטוריית המוסד ופותח את המנוי. כתובת CallBack אופציונלית להגדרה בפורטל נדרים (רק מפעילה
          רענון): <code dir="ltr">{cb ? cb.replace(/key=.*$/, "key=••••••") : "— (אין סוד CallBack; לא חובה)"}</code>
        </p>
      </div>

      <NedarimSyncCard
        hasApi={cfg.hasApiPassword}
        minIntervalMin={Math.round(SYNC_MIN_INTERVAL_SEC / 60)}
        data={{
          lastSuccessAt: syncState?.lastSuccessAt ?? null,
          lastFetchAt: syncState?.lastFetchAt ?? null,
          lastTransactionId: syncState?.lastTransactionId ?? null,
          lastFetchCount: syncState?.lastFetchCount ?? null,
          consecutiveErrors: syncState?.consecutiveErrors ?? 0,
          lastError: syncState?.lastError ?? null,
          nextAllowedAt: nextAllowedAt(syncState, SYNC_MIN_INTERVAL_SEC),
          cutoffAt: syncState?.cutoffAt ?? null,
          hourCalls: currentHourCalls(syncState),
          hourCap: HOURLY_CALL_CAP,
          cachedTransactions: cachedTx,
          withoutDate,
          maxRows: MAX_ROWS,
          unmatched: unmatched.map((t) => ({ transactionId: t.transactionId, amount: t.amount, phone: t.phone, email: t.email, comments: t.comments, transactionAt: t.transactionAt, fetchedAt: t.fetchedAt, approved: t.approved })),
        }}
      />

      <NedarimSecretsCard statuses={secretStatuses} />

      <NedarimCategoriesCard categories={nedarimCategories} loadError={categoriesError} sync={syncRows} maxCouponPercent={maxCoupon} />

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">סטטוס:</span>
          {NEDARIM_STATUSES.map((s) => (
            <Link key={s} href={link({ status: status === s ? undefined : s })} className={chipCls(status === s)}>
              {STATUS_LABEL_HE[s]}
            </Link>
          ))}
          <Link href="/admin/payments" className="chip text-xs bg-gray-100 text-gray-700 hover:bg-gray-200">
            ניקוי
          </Link>
          {ref && <span className="chip bg-pink-soft text-pink">מזהה: {ref}</span>}
        </div>
      </div>

      <div className="card p-3 sm:p-5 overflow-x-auto">
        {data.length === 0 ? (
          <p className="text-muted text-sm">אין בקשות תשלום התואמות לסינון.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <th className="py-2 pe-3 font-medium">מזהה</th>
                <th className="py-2 pe-3 font-medium">משתמשת</th>
                <th className="py-2 pe-3 font-medium">מסלול</th>
                <th className="py-2 pe-3 font-medium">סכום</th>
                <th className="py-2 pe-3 font-medium">סטטוס</th>
                <th className="py-2 pe-3 font-medium">עסקה</th>
                <th className="py-2 pe-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <NedarimPaymentRow key={p.id} p={p} hasApi={cfg.hasApiPassword} highlight={!!ref && p.reference === ref} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
