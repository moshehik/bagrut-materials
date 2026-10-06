import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gt, inArray, isNull, or, asc } from "drizzle-orm";
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getRootSubjects } from "@/lib/data";
import { SUBJECT_HOUSES, SUBJECT_ICONS, YEARLY_INCLUDED_SUBJECTS, subjectDisplayTitle } from "@/lib/constants";
import { addYearlySubjectAction, swapYearlySubjectAction } from "@/lib/actions/subscription-subjects";
import { PendingSubjectsForm } from "@/components/pending-subjects-form";
import { BackButton, fmtDate } from "@/components/account-ui";

export const metadata: Metadata = { title: "המקצועות במנוי השנתי" };
export const dynamic = "force-dynamic";

export default async function SubscriptionSubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/subjects");

  const [rows, roots] = await Promise.all([
    db
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.userId, user.id),
          inArray(purchases.plan, ["yearly", "substitute_3m"]),
          eq(purchases.status, "active"),
          or(isNull(purchases.endsAt), gt(purchases.endsAt, new Date())),
        ),
      )
      .orderBy(asc(purchases.id)),
    getRootSubjects(),
  ]);
  const subjects = roots.map((r) => ({
    id: r.id,
    title: subjectDisplayTitle(r.slug, r.title),
    slug: r.slug,
    icon: r.icon ?? SUBJECT_ICONS[r.slug] ?? "📘",
  }));
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const pendingRows = rows.filter((r) => r.subjectsPending);
  // שורות עם categoryId ריק ובלי "ממתין" = מנוי ישן עם גישה לכל המקצועות (אין מה לבחור)
  const assigned = rows.filter((r) => !r.subjectsPending && r.categoryId !== null);
  // מנויים (קבוצות לפי הזמנה) שעוד לא מילאו את המכסה: אפשר להוסיף להם מקצוע באותו מחיר, והוא מסתיים עם המנוי
  const groups = new Map<string, typeof assigned>();
  for (const r of assigned) {
    const key = `${r.plan}-${r.paymentRef ?? `id-${r.id}`}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const addable = [...groups.values()].filter((g) => g.length < YEARLY_INCLUDED_SUBJECTS);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
        <div>
          <h1 className="text-4xl md:text-5xl">המקצועות במנוי השנתי</h1>
          <p className="mt-2 max-w-md">
            המנוי כולל עד {YEARLY_INCLUDED_SUBJECTS} מקצועות באותו מחיר. אפשר להוסיף מקצוע בכל שלב, או להחליף מקצוע
            שעדיין לא הורדת ממנו.
          </p>
          <BackButton href="/account/purchases" label="חזרה לרכישות ומנויים" />
        </div>
      </div>

      {msg && (
        <p role="status" className="gate-panel mx-auto mt-6 max-w-2xl text-center text-[#ffd45a]">
          {msg}
        </p>
      )}

      {rows.length === 0 && (
        <section className="gate-panel mx-auto mt-8 max-w-2xl text-center">
          <span className="gold-ring" aria-hidden="true" />
          <p className="text-xl">אין לך מנוי שנתי פעיל.</p>
          <Link href="/pricing" className="btn btn-gold btn-gate mt-4 py-2">למסלולים</Link>
        </section>
      )}

      {pendingRows.map((p) => (
        <section key={p.id} className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8">
          <span className="gold-ring" aria-hidden="true" />
          <p className="mb-6 text-xl text-[#ffd45a]">
            המנוי השנתי שלך פעיל, אבל עוד לא בחרת מקצוע – עד הבחירה אין גישה להורדות. אפשר לבחור מקצוע אחד ולהוסיף
            עוד בהמשך השנה, עד {YEARLY_INCLUDED_SUBJECTS} מקצועות.
          </p>
          <PendingSubjectsForm purchaseId={p.id} subjects={subjects} />
        </section>
      ))}

      {assigned.length > 0 && (
        <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby="mine-h">
          <span className="gold-ring" aria-hidden="true" />
          <h2 id="mine-h" className="text-center text-3xl">המקצועות שלי</h2>
          <p className="mt-1 text-center text-[#ffd45a]">
            כל עוד לא התבצעה הורדה במקצוע, אפשר להחליף אותו במקצוע אחר.
          </p>
          <ul className="mt-6 space-y-4">
            {assigned.map((p) => {
              const s = p.categoryId !== null ? byId.get(p.categoryId) : undefined;
              const locked = p.downloadsUsed > 0;
              const held = new Set(
                assigned
                  .filter((a) => a.plan === p.plan && a.paymentRef === p.paymentRef)
                  .map((a) => a.categoryId),
              );
              return (
                <li key={p.id} className="gate-card gate-pick !cursor-default flex-wrap">
                  {s?.slug && SUBJECT_HOUSES[s.slug] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="gate-pick-house" src={SUBJECT_HOUSES[s.slug]} alt="" width={356} height={266} />
                  )}
                  <span className="text-xl">{s?.title ?? "מקצוע"}</span>
                  {locked ? (
                    <span className="ms-auto text-sm text-gray-500">בוצעה הורדה – אי אפשר להחליף</span>
                  ) : (
                    <form action={swapYearlySubjectAction} className="ms-auto flex flex-wrap items-center gap-2">
                      <input type="hidden" name="purchaseId" value={p.id} />
                      <label className="sr-only" htmlFor={`swap-${p.id}`}>מקצוע חדש</label>
                      <select
                        id={`swap-${p.id}`}
                        name="categoryId"
                        required
                        defaultValue=""
                        className="rounded-lg border-2 border-black bg-white px-2 py-1 text-base"
                      >
                        <option value="" disabled>להחלפה במקצוע…</option>
                        {subjects
                          .filter((x) => !held.has(x.id))
                          .map((x) => (
                            <option key={x.id} value={x.id}>{x.title}</option>
                          ))}
                      </select>
                      <button type="submit" className="btn btn-gold btn-gate py-1">החלפה</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {addable.map((g) => {
        const held = new Set(g.map((a) => a.categoryId));
        const left = YEARLY_INCLUDED_SUBJECTS - g.length;
        return (
          <section key={g[0].id} className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby={`add-h-${g[0].id}`}>
            <span className="gold-ring" aria-hidden="true" />
            <h2 id={`add-h-${g[0].id}`} className="text-center text-3xl">הוספת מקצוע</h2>
            <p className="mt-1 text-center text-[#ffd45a]">
              אפשר להוסיף עוד {left === 1 ? "מקצוע אחד" : `${left} מקצועות`} באותו מחיר, בלי תשלום נוסף. המקצוע שיתווסף
              יסתיים יחד עם המנוי{g[0].endsAt ? ` – בתאריך ${fmtDate(g[0].endsAt)}` : " (שנה מההורדה הראשונה)"}.
            </p>
            <form action={addYearlySubjectAction} className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <input type="hidden" name="purchaseId" value={g[0].id} />
              <label className="sr-only" htmlFor={`add-${g[0].id}`}>מקצוע להוספה</label>
              <select
                id={`add-${g[0].id}`}
                name="categoryId"
                required
                defaultValue=""
                className="rounded-lg border-2 border-black bg-white px-2 py-1 text-base"
              >
                <option value="" disabled>בחרי מקצוע…</option>
                {subjects
                  .filter((x) => !held.has(x.id))
                  .map((x) => (
                    <option key={x.id} value={x.id}>{x.title}</option>
                  ))}
              </select>
              <button type="submit" className="btn btn-gold btn-gate py-1">הוספה</button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
