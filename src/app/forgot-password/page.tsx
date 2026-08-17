import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, MailCheck, ShieldCheck, Clock } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "שכחתי סיסמה" };

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/account");

  return (
    <AuthShell
      icon={<KeyRound className="h-6 w-6" />}
      title="שכחת את הסיסמה?"
      subtitle="קורה לכולנו. נשלח לך קישור לבחירת סיסמה חדשה"
      aside={
        <div className="space-y-4">
          <h2 className="font-display text-3xl font-bold leading-tight">
            שלושה צעדים
            <br />
            <span className="gold-text">וחוזרים לשיעורים</span>
          </h2>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3 items-start">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-blue-soft text-blue-deep shrink-0">
                <MailCheck className="h-4 w-4" />
              </span>
              <span>
                <b>הזיני את המייל</b> שאיתו נרשמת – נשלח אלייך קישור.
              </span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-pink-soft text-pink shrink-0">
                <Clock className="h-4 w-4" />
              </span>
              <span>
                <b>הקישור בתוקף לשעה</b> – אם פג, פשוט בקשי חדש.
              </span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-gold-soft text-[#8a6500] shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span>
                <b>בחרי סיסמה חדשה</b> – ותוכלי להתחבר מיד.
              </span>
            </li>
          </ul>
        </div>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
