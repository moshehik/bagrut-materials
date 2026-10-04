import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { CompleteProfileForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "השלמת פרטים" };
export const dynamic = "force-dynamic";

/** עמוד ביניים אחרי הרשמה דרך גוגל: גוגל מוסר שם ומייל, והעיר, התיכון והטלפון מושלמים כאן. */
export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/complete?next=${encodeURIComponent(safeNext)}`)}`);
  if (user.city && user.school && user.phone) redirect(safeNext);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-y-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-52 sm:w-64" />
        <div>
          <h1 className="text-4xl md:text-5xl">כמעט סיימנו</h1>
          <p className="mt-2 max-w-md">גוגל כבר מסרה את השם והמייל שלך. נשארו עוד שלושה פרטים.</p>
        </div>
      </div>

      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8">
        <span className="gold-ring" aria-hidden="true" />
        <CompleteProfileForm next={safeNext} />
      </section>
    </div>
  );
}
