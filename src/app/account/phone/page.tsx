import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Phone } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
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
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/phone?next=${encodeURIComponent(safeNext)}`)}`);
  if (user.phone) redirect(safeNext);

  return (
    <AuthShell
      logoHeader
      icon={<Phone className="h-6 w-6" />}
      title="עוד פרט אחד לפני ההורדה"
      subtitle="יש להשלים מספר טלפון. הוא נשמר בחשבון שלך ומוטבע בסימן המים השקוף של הקבצים שאת מורידה, יחד עם השם, המייל והמספר האישי."
    >
      <EditPhoneForm next={safeNext} />
    </AuthShell>
  );
}
