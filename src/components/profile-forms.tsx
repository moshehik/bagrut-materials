"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, KeyRound, Mail, UserRound } from "lucide-react";
import { updateNameAction, changePasswordAction, requestEmailChangeAction } from "@/lib/actions/profile";

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-3 py-2 text-xs animate-pop">
      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

function SuccessBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl bg-green-50 text-green-800 px-3 py-2 text-xs animate-pop">
      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function EditNameForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState(updateNameAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm font-bold flex items-center gap-2">
        <UserRound className="h-4 w-4 text-blue" /> שינוי שם
      </p>
      <ErrorBox error={state?.error} />
      <SuccessBox message={state?.ok ? state.message : undefined} />
      <div className="flex flex-wrap gap-2">
        <input name="name" defaultValue={currentName} required minLength={2} className="input !py-1.5 flex-1 min-w-[180px]" />
        <button type="submit" disabled={pending} className="btn btn-ghost !py-1.5 text-sm">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} עדכני
        </button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm font-bold flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-pink" /> שינוי סיסמה
      </p>
      <ErrorBox error={state?.error} />
      <SuccessBox message={state?.ok ? state.message : undefined} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          placeholder="סיסמה נוכחית"
          required
          dir="ltr"
          className="input !py-1.5 text-left"
        />
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="סיסמה חדשה"
          required
          minLength={6}
          dir="ltr"
          className="input !py-1.5 text-left"
        />
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="אימות סיסמה"
          required
          minLength={6}
          dir="ltr"
          className="input !py-1.5 text-left"
        />
      </div>
      <button type="submit" disabled={pending} className="btn btn-ghost !py-1.5 text-sm">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} עדכני סיסמה
      </button>
    </form>
  );
}

export function ChangeEmailForm({ currentEmail, pendingEmail }: { currentEmail: string; pendingEmail?: string | null }) {
  const [state, action, pending] = useActionState(requestEmailChangeAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm font-bold flex items-center gap-2">
        <Mail className="h-4 w-4 text-gold" /> שינוי כתובת מייל
      </p>
      {pendingEmail && !state?.ok && (
        <p className="text-xs text-muted">
          ממתין לאימות: <span dir="ltr" className="font-mono">{pendingEmail}</span> (בדקי את תיבת המייל)
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
          className="input !py-1.5 text-left flex-1 min-w-[200px]"
        />
        <button type="submit" disabled={pending} className="btn btn-ghost !py-1.5 text-sm">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} שלחי קישור אימות
        </button>
      </div>
      <p className="text-xs text-muted">השינוי ייכנס לתוקף רק לאחר אימות הכתובת החדשה במייל.</p>
    </form>
  );
}
