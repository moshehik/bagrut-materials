"use client";

import { useState, useTransition } from "react";
import { MailWarning, MailCheck, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { sendVerificationEmail } from "@/lib/actions/password";

/**
 * באנר "המייל שלך עדיין לא אומת" – לאזור האישי, בעיצוב חלונית "שימי לב!".
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
      <div role="status" className="gate-panel mx-auto mt-6 flex max-w-3xl items-center gap-3 text-[#ffd45a] animate-pop">
        <span className="gold-ring" aria-hidden="true" />
        <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
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
    <div className="gate-panel mx-auto mt-6 max-w-3xl animate-fade-up">
      <span className="gold-ring" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="gate-icon">
          <MailWarning className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-[200px] flex-1">
          <p className="text-xl text-[#ffd45a]">
            {failed ? "קישור האימות אינו תקף או שפג תוקפו." : "כתובת המייל שלך עדיין לא אומתה"}
          </p>
          <p className="text-base">
            נשלח קישור אימות אל <span dir="ltr">{email}</span>. האימות עוזר לנו לשמור על החשבון שלך.
          </p>
        </div>
        <button type="button" onClick={send} disabled={pending} className="btn btn-gold btn-gate py-2 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MailCheck className="h-4 w-4" aria-hidden />}
          שלחי מייל אימות
        </button>
      </div>
      {msg && (
        <p
          role="status"
          className={`mt-3 flex items-center gap-2 text-base ${msg.ok ? "text-[#ffd45a]" : "text-[#ffd9d2]"}`}
        >
          {msg.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertCircle className="h-4 w-4" aria-hidden />}
          {msg.text}
        </p>
      )}
    </div>
  );
}
