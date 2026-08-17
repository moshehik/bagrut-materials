import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "הצטרפות" };

const PERKS = [
  "גישה לכל עץ המקצועות והפרקים של הבגרות במחוז החרדי",
  "דפי שכפול לתלמידה ולמורה, מצגות ושאלות מבגרויות קודמות",
  "מנויים גמישים – לפי מקצוע, לפי מערכת השעות או שנתי",
  "מספר אישי ייחודי לשמירה על זכויות היוצרים",
];

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/account");

  return (
    <AuthShell
      icon={<UserPlus className="h-6 w-6" />}
      title="הצטרפי לחומרים לבגרות"
      subtitle="ההרשמה חינמית ולוקחת פחות מדקה"
      aside={
        <div className="card p-6 sm:p-8 bg-gradient-to-br from-white to-blue-soft/60">
          <h2 className="font-display text-2xl font-bold mb-4">מה מחכה לך בפנים?</h2>
          <ul className="space-y-3">
            {PERKS.map((p) => (
              <li key={p} className="flex gap-3 items-start text-sm">
                <span className="grid place-items-center h-6 w-6 rounded-full bg-blue text-white shrink-0 mt-0.5">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
