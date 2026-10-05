"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, KeyRound, Mail, Phone, UserRound } from "lucide-react";
import {
  updateNameAction,
  updatePhoneAction,
  changePasswordAction,
  requestEmailChangeAction,
} from "@/lib/actions/profile";

/* הטפסים יושבים בתוך חלונית כחולה כהה (.gate-panel): שדות זהב בהיר במסגרת שחורה, לחצני זהב */

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="gate-strip gate-strip-alert animate-pop !py-2 text-base">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{error}</span>
    </div>
  );
}

function SuccessBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="status" className="gate-strip animate-pop !justify-start !py-2 text-base">
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
    </div>
  );
}

function FormTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xl text-[#ffd45a]">
      {icon} {children}
    </p>
  );
}

function SubmitBtn({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="btn btn-gold btn-gate py-1.5 disabled:opacity-50">
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {children}
    </button>
  );
}

export function EditNameForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState(updateNameAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormTitle icon={<UserRound className="h-5 w-5" aria-hidden />}>שינוי שם</FormTitle>
      <ErrorBox error={state?.error} />
      <SuccessBox message={state?.ok ? state.message : undefined} />
      <div className="flex flex-wrap gap-2">
        <input
          name="name"
          defaultValue={currentName}
          required
          minLength={2}
          aria-label="שם"
          className="gate-input min-w-[180px] flex-1"
        />
        <SubmitBtn pending={pending}>עדכני</SubmitBtn>
      </div>
    </form>
  );
}

export function EditPhoneForm({ currentPhone, next }: { currentPhone?: string | null; next?: string }) {
  const [state, action, pending] = useActionState(updatePhoneAction, undefined);
  return (
    <form action={action} className="space-y-3">
      {!next && <FormTitle icon={<Phone className="h-5 w-5" aria-hidden />}>מספר טלפון</FormTitle>}
      <ErrorBox error={state?.error} />
      <SuccessBox message={state?.ok ? state.message : undefined} />
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-wrap gap-2">
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={currentPhone ?? ""}
          required
          dir="ltr"
          placeholder="050-1234567"
          aria-label="מספר טלפון"
          className="gate-input min-w-[180px] flex-1 text-left"
        />
        <SubmitBtn pending={pending}>{next ? "שמירה והמשך להורדה" : "עדכני"}</SubmitBtn>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormTitle icon={<KeyRound className="h-5 w-5" aria-hidden />}>שינוי סיסמה</FormTitle>
      <ErrorBox error={state?.error} />
      <SuccessBox message={state?.ok ? state.message : undefined} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          placeholder="סיסמה נוכחית"
          aria-label="סיסמה נוכחית"
          required
          dir="ltr"
          className="gate-input text-left"
        />
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="סיסמה חדשה"
          aria-label="סיסמה חדשה"
          required
          minLength={6}
          dir="ltr"
          className="gate-input text-left"
        />
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="אימות סיסמה"
          aria-label="אימות סיסמה"
          required
          minLength={6}
          dir="ltr"
          className="gate-input text-left"
        />
      </div>
      <SubmitBtn pending={pending}>עדכני סיסמה</SubmitBtn>
    </form>
  );
}

export function ChangeEmailForm({
  currentEmail,
  pendingEmail,
  passwordRequired = true,
}: {
  currentEmail: string;
  pendingEmail?: string | null;
  /** false בחשבון שנרשם דרך גוגל (אין לו סיסמה שהמשתמשת מכירה) – השרת פוטר אותו מהסיסמה */
  passwordRequired?: boolean;
}) {
  const [state, action, pending] = useActionState(requestEmailChangeAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormTitle icon={<Mail className="h-5 w-5" aria-hidden />}>שינוי כתובת מייל</FormTitle>
      {pendingEmail && !state?.ok && (
        <p className="text-base">
          ממתין לאימות: <span dir="ltr">{pendingEmail}</span> (בדקי את תיבת המייל)
        </p>
      )}
      <ErrorBox error={state?.error} />
      <SuccessBox message={state?.ok ? state.message : undefined} />
      <div className="flex flex-wrap gap-2">
        <input
          name="email"
          type="email"
          defaultValue={pendingEmail ?? currentEmail}
          required
          dir="ltr"
          aria-label="כתובת מייל"
          className="gate-input min-w-[200px] flex-1 text-left"
        />
        {passwordRequired && (
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            placeholder="סיסמה נוכחית"
            aria-label="סיסמה נוכחית"
            required
            dir="ltr"
            className="gate-input min-w-[160px] text-left"
          />
        )}
        <SubmitBtn pending={pending}>שלחי קישור אימות</SubmitBtn>
      </div>
      <p className="text-base opacity-80">
        השינוי ייכנס לתוקף רק לאחר אימות הכתובת החדשה במייל.
        {passwordRequired && " לאבטחת החשבון נדרשת גם הסיסמה הנוכחית."}
      </p>
    </form>
  );
}
