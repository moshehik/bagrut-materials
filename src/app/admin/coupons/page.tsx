import { requireAdminPage } from "@/lib/session";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, privateCoupons, users } from "@/db/schema";
import { getRootSubjects } from "@/lib/data";
import { benefitText, parseSubjectIds } from "@/lib/private-coupons";
import { revokePrivateCoupon } from "@/lib/actions/private-coupons";
import { CouponForm } from "@/components/admin/coupon-form";
import { CopyButton } from "@/components/admin/copy-button";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "פעיל", cls: "bg-blue-soft text-blue-deep" },
  used: { label: "מומש", cls: "bg-gold-soft text-gold" },
  revoked: { label: "בוטל", cls: "bg-pink-soft text-pink" },
};

export default async function AdminCouponsPage() {
  await requireAdminPage();
  const [roots, rows, allCats] = await Promise.all([
    getRootSubjects(true),
    db
      .select({ c: privateCoupons, claimerName: users.name, claimerEmail: users.email })
      .from(privateCoupons)
      .leftJoin(users, eq(privateCoupons.claimedBy, users.id))
      .orderBy(desc(privateCoupons.createdAt)),
    db.select({ id: categories.id, title: categories.title }).from(categories),
  ]);
  const titleOf = new Map(allCats.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">קופונים פרטיים</h2>
        <span className="chip bg-blue-soft text-blue-deep">{rows.length}</span>
      </div>
      <p className="text-sm text-muted">
        הקופונים כאן גלויים רק לך. קופון לכתובת מייל מופיע אוטומטית ב&quot;קופונים זמינים&quot; של מי שנכנסת עם המייל הזה;
        אפשר גם לשלוח לה את הקישור או את הקוד. כל קופון חד-פעמי.
      </p>

      <CouponForm subjects={roots.map((r) => ({ id: r.id, title: r.title }))} />

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">אין עדיין קופונים.</div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map(({ c, claimerName, claimerEmail }) => {
            const st = STATUS[c.status] ?? { label: c.status, cls: "bg-blue-soft" };
            const subjectTitles = parseSubjectIds(c).map((id) => titleOf.get(id) ?? `#${id}`);
            const expired = c.status === "active" && c.expiresAt && c.expiresAt < new Date();
            return (
              <li key={c.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg leading-tight">{c.label}</h3>
                    <div className="text-sm">{benefitText(c, subjectTitles)}</div>
                  </div>
                  <span className={`chip ${expired ? "bg-pink-soft text-pink" : st.cls} ms-auto shrink-0`}>
                    {expired ? "פג תוקף" : st.label}
                  </span>
                </div>
                <div className="text-sm space-y-0.5">
                  <div>
                    קוד: <b dir="ltr">{c.code}</b>
                  </div>
                  <div>
                    מיועד ל: {c.email ? <b dir="ltr">{c.email}</b> : <span className="text-muted">כל מי שמחזיקה בקוד</span>}
                  </div>
                  {c.claimedBy && claimerEmail && (
                    <div className="text-muted">
                      שויך ל: {claimerName} ({claimerEmail})
                    </div>
                  )}
                  {c.expiresAt && <div className="text-muted">בתוקף עד {c.expiresAt.toLocaleDateString("he-IL")}</div>}
                  {c.usedAt && <div className="text-muted">מומש ב-{c.usedAt.toLocaleDateString("he-IL")}</div>}
                  {c.note && <div className="text-muted">הערה: {c.note}</div>}
                </div>
                {c.status === "active" && (
                  <div className="flex flex-wrap items-center gap-2 mt-auto">
                    <CopyButton text={`/coupons?code=${c.code}`} label="העתקת קישור" />
                    <CopyButton text={c.code} label="העתקת קוד" />
                    <form action={revokePrivateCoupon} className="ms-auto">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-xs text-red-600 underline">ביטול קופון</button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
