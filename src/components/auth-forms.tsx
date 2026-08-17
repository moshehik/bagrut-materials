"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LogIn, UserPlus, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { loginAction, registerAction } from "@/lib/actions/auth";

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#8a1c4f] px-4 py-3 text-sm animate-pop"
    >
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <ErrorBox error={state?.error} />
      <label className="block">
        <span className="text-sm font-semibold">כתובת מייל</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          dir="ltr"
          className="input mt-1 text-left"
          placeholder="you@example.com"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">סיסמה</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          dir="ltr"
          className="input mt-1 text-left"
          placeholder="••••••••"
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary w-full mt-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        התחברי
      </button>
      <p className="text-center text-sm text-muted">
        עדיין אין לך חשבון?{" "}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="text-blue-deep font-semibold hover:underline"
        >
          הצטרפי עכשיו
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <ErrorBox error={state?.error} />
      <label className="block">
        <span className="text-sm font-semibold">שם מלא</span>
        <input
          name="name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          className="input mt-1"
          placeholder="למשל: רחל כהן"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">כתובת מייל</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          dir="ltr"
          className="input mt-1 text-left"
          placeholder="you@example.com"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">סיסמה</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          dir="ltr"
          className="input mt-1 text-left"
          placeholder="6 תווים לפחות"
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-pink w-full mt-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        צרי חשבון
      </button>
      <p className="text-xs text-muted text-center flex items-center justify-center gap-1">
        <Sparkles className="h-3 w-3 text-gold" />
        עם ההרשמה תקבלי מספר אישי שיוטבע על כל קובץ שתורידי
      </p>
      <p className="text-center text-sm text-muted">
        כבר רשומה?{" "}
        <Link href="/login" className="text-blue-deep font-semibold hover:underline">
          התחברי
        </Link>
      </p>
    </form>
  );
}
