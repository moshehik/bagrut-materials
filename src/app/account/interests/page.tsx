import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckCircle2, Check, Heart } from "lucide-react";
import { db } from "@/db";
import { userInterests } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getRootSubjects } from "@/lib/data";
import { SUBJECT_ICONS, SUBJECT_HOUSES, subjectDisplayTitle } from "@/lib/constants";
import { updateInterestsAction } from "@/lib/actions/profile";
import { AccountTitle, Notice, Panel } from "@/components/account-ui";

export const metadata: Metadata = { title: "מקצועות שמעניינים אותי" };
export const dynamic = "force-dynamic";

export default async function AccountInterestsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/interests");

  const [roots, myInterests] = await Promise.all([
    getRootSubjects(),
    db.select({ categoryId: userInterests.categoryId }).from(userInterests).where(eq(userInterests.userId, user.id)),
  ]);
  const interestIds = new Set(myInterests.map((r) => r.categoryId));

  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle
        title="מקצועות שמעניינים אותי"
        subtitle="סמני את המקצועות שמעניינים אותך – זה יעזור לנו להתאים לך עדכונים והמלצות."
        back
      />

      {saved === "1" && <Notice icon={CheckCircle2}>נושאי הלימוד שלך נשמרו.</Notice>}

      <Panel id="interests-h" title="בחירת מקצועות" icon={Heart}>
        <form action={updateInterestsAction} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {roots.map((r) => (
              <label key={r.id} className="gate-card gate-pick acc-pick">
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={r.id}
                  defaultChecked={interestIds.has(r.id)}
                  className="sr-only"
                />
                <span className="gate-check" aria-hidden>
                  <Check className="h-5 w-5" strokeWidth={3} />
                </span>
                {SUBJECT_HOUSES[r.slug] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="gate-pick-house !w-16" src={SUBJECT_HOUSES[r.slug]} alt="" width={356} height={266} />
                ) : (
                  <span className="w-16 text-center text-2xl" aria-hidden>
                    {r.icon ?? SUBJECT_ICONS[r.slug] ?? "📘"}
                  </span>
                )}
                <span className="flex-1 text-xl leading-snug">{subjectDisplayTitle(r.slug, r.title)}</span>
              </label>
            ))}
          </div>
          <div className="text-center">
            <button type="submit" className="btn btn-gold btn-gate py-2">
              <Check className="h-5 w-5" aria-hidden /> שמירת נושאים
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
