"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { contactAction, type MailState } from "@/lib/actions/mail";

export function ContactForm() {
  const [state, action, pending] = useActionState<MailState, FormData>(contactAction, undefined);
  if (state?.ok) {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 p-6 text-center animate-pop">
        <div className="text-2xl">💌</div>
        <p className="mt-2 font-semibold text-green-800">{state.ok}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          שם
          <input name="name" required className="input mt-1 font-normal" />
        </label>
        <label className="text-sm font-semibold">
          מייל לחזרה
          <input name="email" type="email" required dir="ltr" className="input mt-1 font-normal" />
        </label>
      </div>
      <label className="block text-sm font-semibold">
        ההודעה
        <textarea name="message" required rows={5} className="input mt-1 font-normal" />
      </label>
      {/* honeypot */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          <Send className="h-4 w-4" aria-hidden /> {pending ? "שולח…" : "שליחה"}
        </button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
