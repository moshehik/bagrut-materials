"use client";

import { useState, useTransition } from "react";
import { MailWarning, MailCheck, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { sendVerificationEmail } from "@/lib/actions/password";

/**
 * באנר "המייל שלך עדיין לא אומת" – לאזור האישי.
 * props: verified (מצב נוכחי), email (להצגה), justVerified (?verified=1 מה-URL)
 */
export function VerifyEmailBanner({
  verified,
  email,
  justVerified,
  failed,
}: {
  verified: boolean;
  email: string;
  justVerified?: boolean;
  failed?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (verified) {
    if (!justVerified) return null;
    return (
      <div className="card p-4 flex items-center gap-3 bg-green-50 text-green-800 text-sm animate-pop">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <span>כתובת המייל אומתה בהצלחה. תודה!</span>
      </div>
    );
  }

  function send() {
    setMsg(null);
    start(async () => {
      const r = await sendVerificationEmail();
      if (r?.error) setMsg({ ok: false, text: r.error });
      else setMsg({ ok: true, text: r?.message ?? "נשלח" });
    });
  }

  return (
    <div className="card p-4 sm:p-5 bg-gold-soft/50 border border-gold/30 animate-fade-up">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-white text-[#8a6500] shrink-0">
          <MailWarning className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-[200px]">
          <p className="font-semibold text-sm">
            {failed ? "קישור האימות אינו תקף או שפג תוקפו." : "כתובת המייל שלך עדיין לא אומתה"}
          </p>
          <p className="text-xs text-muted">
            נשלח קישור אימות אל <span dir="ltr">{email}</span>. האימות עוזר לנו לשמור על החשבון שלך.
          </p>
        </div>
        <button type="button" onClick={send} disabled={pending} className="btn btn-gold text-sm py-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
          שלחי מייל אימות
        </button>
      </div>
      {msg && (
        <p
          role="status"
          className={`mt-3 text-sm flex items-center gap-2 ${msg.ok ? "text-green-800" : "text-[#9d4a2a]"}`}
        >
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </p>
      )}
    </div>
  );
}
