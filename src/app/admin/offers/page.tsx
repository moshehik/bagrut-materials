import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sellOffers, users } from "@/db/schema";
import { OfferStatusForm } from "@/components/admin/offer-status-form";
import { formatPrice } from "@/lib/constants";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "ממתינה", cls: "bg-gold-soft text-gold" },
  accepted: { label: "אושרה", cls: "bg-blue-soft text-blue-deep" },
  rejected: { label: "נדחתה", cls: "bg-pink-soft text-pink" },
};

export default async function AdminOffersPage() {
  const rows = await db
    .select({
      id: sellOffers.id,
      subject: sellOffers.subject,
      title: sellOffers.title,
      description: sellOffers.description,
      askingPrice: sellOffers.askingPrice,
      fileUrl: sellOffers.fileUrl,
      status: sellOffers.status,
      createdAt: sellOffers.createdAt,
      userName: users.name,
      userEmail: users.email,
      userCode: users.personalCode,
    })
    .from(sellOffers)
    .innerJoin(users, eq(sellOffers.userId, users.id))
    .orderBy(desc(sellOffers.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">הצעות מכירת חומרים</h2>
        <span className="chip bg-blue-soft text-blue-deep">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">אין עדיין הצעות.</div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((o) => {
            const st = STATUS[o.status] ?? { label: o.status, cls: "bg-blue-soft" };
            return (
              <li key={o.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted">{o.subject}</div>
                    <h3 className="font-bold text-lg leading-tight">{o.title}</h3>
                  </div>
                  <span className={`chip ${st.cls} ms-auto shrink-0`}>{st.label}</span>
                </div>
                <p className="text-sm whitespace-pre-line">{o.description}</p>
                <div className="text-sm flex flex-wrap gap-x-4 gap-y-1">
                  {o.askingPrice !== null && (
                    <span>
                      מחיר מבוקש: <b>{formatPrice(o.askingPrice)}</b>
                    </span>
                  )}
                  {o.fileUrl && (
                    <a
                      href={o.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-deep underline"
                    >
                      קובץ לדוגמה ↗
                    </a>
                  )}
                  <span className="text-muted">{o.createdAt.toLocaleDateString("he-IL")}</span>
                </div>
                <div className="rounded-xl bg-oak-soft/50 p-3 text-sm">
                  <div className="font-semibold">{o.userName}</div>
                  <div dir="ltr" className="text-right">
                    <a href={`mailto:${o.userEmail}`} className="text-blue-deep underline">
                      {o.userEmail}
                    </a>
                    <span className="text-muted"> · {o.userCode}</span>
                  </div>
                </div>
                <OfferStatusForm id={o.id} status={o.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
