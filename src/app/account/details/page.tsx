import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRound, Fingerprint, ShieldCheck, Settings2, ChevronDown } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { AccountTitle, Panel, fmtDate } from "@/components/account-ui";
import { EditNameForm, EditPhoneForm, ChangePasswordForm, ChangeEmailForm } from "@/components/profile-forms";

export const metadata: Metadata = { title: "הנתונים שלי" };
export const dynamic = "force-dynamic";

export default async function AccountDetailsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/details");

  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle title="הנתונים שלי" subtitle="הפרטים האישיים שלך והמספר האישי." back />

      <Panel id="details-h" title="הפרטים שלי" icon={UserRound}>
        <div className="gate-card">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="gate-soft text-base">שם</dt>
              <dd className="text-xl">{user.name}</dd>
            </div>
            <div>
              <dt className="gate-soft text-base">מייל</dt>
              <dd className="break-all text-xl">
                <span dir="ltr" className="inline-block">
                  {user.email}
                </span>
                {user.pendingEmail && (
                  <span className="gate-soft block text-base">
                    ממתין לאימות: <span dir="ltr">{user.pendingEmail}</span>
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="gate-soft text-base">טלפון</dt>
              <dd className="text-xl">
                {user.phone ? (
                  <span dir="ltr" className="inline-block">
                    {user.phone}
                  </span>
                ) : (
                  <span className="gate-soft">חסר – יש להשלים לפני ההורדה הבאה</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="gate-soft text-base">חברה מאז</dt>
              <dd className="text-xl">{fmtDate(user.createdAt)}</dd>
            </div>
            {user.role === "admin" && (
              <div className="sm:col-span-2">
                <dt className="gate-soft text-base">הרשאה</dt>
                <dd>
                  <Link href="/admin" className="gate-badge !text-lg">
                    <ShieldCheck className="me-1 inline h-4 w-4" aria-hidden /> מנהלת האתר
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>

        <details className="acc-edit mt-5">
          <summary>
            <span className="btn btn-gold btn-gate py-2">
              <Settings2 className="h-5 w-5" aria-hidden /> עריכת פרטים וסיסמה
              <ChevronDown className="acc-edit-chev h-5 w-5 transition-transform" aria-hidden />
            </span>
          </summary>
          <div className="mt-6 space-y-6">
            <EditNameForm currentName={user.name} />
            <hr className="gate-divider !border-[#ffd45a]/40" />
            <EditPhoneForm currentPhone={user.phone} />
            <hr className="gate-divider !border-[#ffd45a]/40" />
            <ChangeEmailForm currentEmail={user.email} pendingEmail={user.pendingEmail} />
            <hr className="gate-divider !border-[#ffd45a]/40" />
            <ChangePasswordForm />
          </div>
        </details>
      </Panel>

      <Panel id="code-h" title="המספר האישי שלך" icon={Fingerprint}>
        <div className="gate-card">
          <div className="acc-code" dir="ltr">
            {user.personalCode}
          </div>
          <p className="gate-soft mt-3 text-lg leading-snug">
            מספר זה מוטבע על כל קובץ שאת מורידה כסימן מים שקוף, יחד עם השם, המייל והטלפון שלך. כך החומרים שומרים על
            זכויות היוצרים של הכותבות, ואת יכולה להשתמש בהם בכיתה בחופשיות. נא לא להעביר קבצים הלאה.
          </p>
        </div>
      </Panel>
    </div>
  );
}
