import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, AlertCircle } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "בחירת סיסמה חדשה" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      icon={<KeyRound className="h-6 w-6" />}
      title="בחירת סיסמה חדשה"
      subtitle="בחרי סיסמה של 6 תווים לפחות – ורצוי כזו שקל לך לזכור"
      aside={
        <div className="card p-6 sm:p-8 bg-gradient-to-br from-white to-blue-soft/60">
          <h2 className="font-display text-2xl font-bold mb-3">טיפ קטן לסיסמה טובה</h2>
          <p className="text-sm text-muted leading-relaxed">
            משפט קצר שאת זוכרת בקלות (למשל שם של פרשה + מספר) חזק יותר מסיסמה קצרה ומסובכת.
            אל תשתמשי באותה סיסמה כמו במייל שלך.
          </p>
        </div>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-4 py-3 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>הקישור חסר או לא תקין.</span>
          </div>
          <Link href="/forgot-password" className="btn btn-primary w-full">
            בקשי קישור חדש
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
