import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { EditPhoneForm } from "@/components/profile-forms";

export const metadata: Metadata = { title: "השלמת מספר טלפון" };
export const dynamic = "force-dynamic";

/** עמוד ביניים: מי שאין לה טלפון שמור (נרשמה לפני שהשדה נוסף / דרך גוגל) מגיעה לכאן
 * מ-/api/download לפני ההורדה, ואחרי השמירה ממשיכה ישר להורדה (next). */
export default async function CompletePhonePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/phone?next=${encodeURIComponent(safeNext)}`)}`);
  if (user.phone) redirect(safeNext);

  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-y-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-52 sm:w-64" />
        <div>
          <h1 className="text-4xl md:text-5xl">עוד פרט אחד לפני ההורדה</h1>
          <p className="mt-2 max-w-md">
            יש להשלים מספר טלפון. הוא נשמר בחשבון שלך ומוטבע בסימן המים השקוף של הקבצים שאת מורידה, יחד עם השם,
            המייל והמספר האישי.
          </p>
        </div>
      </div>
      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8">
        <span className="gold-ring" aria-hidden="true" />
        <EditPhoneForm next={safeNext} />
      </section>
    </div>
  );
}
