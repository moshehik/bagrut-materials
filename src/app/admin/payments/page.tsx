import Link from "next/link";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { requireAdminPage } from "@/lib/session";
import { db } from "@/db";
import { categories, nedarimPaymentEvents, nedarimPayments, users } from "@/db/schema";
import { loadNedarimConfig } from "@/lib/nedarim/config";
import { NEDARIM_STATUSES, STATUS_LABEL_HE, isNedarimStatus } from "@/lib/nedarim/logic";
import { expireStale, parseCategoryIds } from "@/lib/nedarim/store";
import { siteUrl } from "@/lib/mail";
import { NedarimPaymentRow, type NedarimPaymentRowData } from "@/components/admin/nedarim-payment-row";

/** מסך "תשלומים (נדרים)": כל בקשות התשלום דרך נדרים פלוס, מצב ההגדרה, אימות מחדש / אישור ידני / ביטול. docs/nedarim-payments.md */
export const dynamic = "force-dynamic";

type SP = { status?: string; ref?: string; user?: string };

export default async function AdminNedarimPaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = isNedarimStatus(sp.status) ? sp.status : undefined;
  const userId = sp.user && Number.isInteger(Number(sp.user)) ? Number(sp.user) : undefined;
  const ref = sp.ref?.trim().toUpperCase();

  const cfg = await loadNedarimConfig();
  let tablesReady = true;
  let expired = 0;
  try {
    expired = await expireStale();
  } catch (e) {
    tablesReady = false;
    console.error("[admin payments] nedarim tables missing?", e);
  }

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
    amount: p.amount,
    listAmount: p.listAmount,
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
    events: (evByPayment.get(p.id) ?? []).map((e) => ({ id: e.id, kind: e.kind, message: e.message, detail: e.detail, createdAt: e.createdAt })),
  }));

  const counts = { open: data.filter((d) => d.status === "pending" || d.status === "processing").length, assist: data.filter((d) => d.assistRequestedAt && (d.status === "pending" || d.status === "processing")).length };

  const link = (patch: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/payments${s ? `?${s}` : ""}`;
  };
  const chipCls = (on: boolean) => `chip text-xs ${on ? "bg-oak text-white" : "bg-oak-soft text-oak-deep hover:bg-oak/30"}`;
  const callbackShown = cfg.callbackSecret ? `${siteUrl()}/api/pay/callback?key=••••••` : "— (אין סוד)";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">תשלומים דרך נדרים פלוס</h2>
        <span className="chip bg-yellow-100 text-yellow-800">{counts.open} פתוחים</span>
        {counts.assist > 0 && <span className="chip bg-red-100 text-red-800">{counts.assist} מבקשות עזרה</span>}
        <span className="chip bg-blue-soft text-blue-deep">{data.length} מוצגים</span>
        {expired > 0 && <span className="chip bg-gray-100 text-gray-700">{expired} פגו עכשיו</span>}
      </div>

      <div className={`card p-4 space-y-2 text-sm ${cfg.ready && !cfg.missing.length ? "" : "border border-yellow-300"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">מצב החיבור:</span>
          <span className={`chip ${cfg.ready ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>{cfg.ready ? "פעיל" : "לא פעיל"}</span>
          {cfg.simulate && <span className="chip bg-pink-soft text-pink">מצב דמה (פיתוח)</span>}
          <span className="chip bg-gray-100 text-gray-700">אימות API: {cfg.hasApiPassword ? "יש מפתח" : "אין – אישור ידני"}</span>
          {cfg.trustCallback && <span className="chip bg-yellow-100 text-yellow-800">אמון ב-CallBack (לא מומלץ)</span>}
        </div>
        {!tablesReady && (
          <p className="text-red-700 font-semibold">
            טבלאות nedarim_payments עדיין לא קיימות ב-DB – להריץ <code>npx tsx scripts/create-nedarim-tables.ts --apply</code>.
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
          כתובת ה-CallBack שנשלחת לנדרים בכל עסקה (ורצוי להגדיר גם בפורטל שלהם): <code dir="ltr">{callbackShown}</code> · קוד מוסד:{" "}
          <code dir="ltr">{cfg.mosadId || "—"}</code> · ה-iframe נטען מ-matara.pro – אצל מורות עם נטפרי הוא עלול להיחסם; הן מקבלות בעמוד
          התשלום כפתור «להשלים את התשלום דרך המנהלת» שמסמן את הבקשה כאן ושולח לך מייל. הסודות עצמם במשתני סביבה בלבד.
        </p>
      </div>

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
