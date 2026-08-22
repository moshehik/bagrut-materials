"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LogIn, UserPlus, Loader2, AlertCircle, Sparkles, KeyRound, MailCheck, CheckCircle2 } from "lucide-react";
import { loginAction, registerAction } from "@/lib/actions/auth";
import { requestPasswordReset, resetPassword } from "@/lib/actions/password";

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-4 py-3 text-sm animate-pop"
    >
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

function SuccessBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm animate-pop"
    >
      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** כפתור "המשך עם Google" + מפריד */
function GoogleButton({ next, enabled }: { next?: string; enabled?: boolean }) {
  if (!enabled) return null;
  const href = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="space-y-4">
      <a
        href={href}
        className="btn btn-ghost w-full bg-white border border-blue/15 hover:border-blue/30 shadow-sm"
      >
        <GoogleIcon />
        המשך עם Google
      </a>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-blue/10" />
        או במייל
        <span className="h-px flex-1 bg-blue/10" />
      </div>
    </div>
  );
}

const URL_MESSAGES: Record<string, string> = {
  google: "ההתחברות עם Google לא הצליחה. נסי שוב או התחברי עם מייל וסיסמה.",
  registration_closed: "ההרשמה סגורה כרגע. פני למנהלת האתר.",
  suspended: "החשבון מושהה. פני למנהלת האתר.",
};

export function LoginForm({
  next,
  googleEnabled,
  urlError,
  notice,
}: {
  next?: string;
  googleEnabled?: boolean;
  /** מפתח שגיאה מה-URL (?error=google / ?suspended=1) */
  urlError?: string;
  /** הודעת הצלחה (למשל אחרי איפוס סיסמה) */
  notice?: string;
}) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <div className="space-y-5">
      <GoogleButton next={next} enabled={googleEnabled} />
      <form action={action} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <SuccessBox message={notice} />
        <ErrorBox error={state?.error ?? (urlError ? URL_MESSAGES[urlError] : undefined)} />
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
          <span className="text-sm font-semibold flex items-center justify-between">
            סיסמה
            <Link href="/forgot-password" className="hover-move text-xs font-medium text-blue-deep hover:underline">
              שכחתי סיסמה
            </Link>
          </span>
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
            className="hover-move text-blue-deep font-semibold hover:underline"
          >
            הצטרפי עכשיו
          </Link>
        </p>
      </form>
    </div>
  );
}

export function RegisterForm({ next, googleEnabled }: { next?: string; googleEnabled?: boolean }) {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <div className="space-y-5">
      <GoogleButton next={next} enabled={googleEnabled} />
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
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="hover-move text-blue-deep font-semibold hover:underline"
          >
            התחברי
          </Link>
        </p>
      </form>
    </div>
  );
}

/** טופס "שכחתי סיסמה" */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <SuccessBox message={state.message} />
        <p className="text-sm text-muted">לא הגיע? בדקי בתיקיית הספאם, או נסי שוב בעוד כמה דקות.</p>
        <Link href="/login" className="btn btn-ghost w-full">
          חזרה להתחברות
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <ErrorBox error={state?.error} />
      <label className="block">
        <span className="text-sm font-semibold">כתובת המייל שאיתה נרשמת</span>
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
      <button type="submit" disabled={pending} className="btn btn-primary w-full mt-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
        שלחי לי קישור לאיפוס
      </button>
      <p className="text-center text-sm text-muted">
        נזכרת?{" "}
        <Link href="/login" className="hover-move text-blue-deep font-semibold hover:underline">
          התחברי
        </Link>
      </p>
    </form>
  );
}

/** טופס בחירת סיסמה חדשה (מקישור במייל) */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <SuccessBox message={state.message} />
        <Link href="/login?reset=1" className="btn btn-primary w-full">
          <LogIn className="h-4 w-4" /> להתחברות
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <ErrorBox error={state?.error} />
      <label className="block">
        <span className="text-sm font-semibold">סיסמה חדשה</span>
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
      <label className="block">
        <span className="text-sm font-semibold">אימות סיסמה</span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          dir="ltr"
          className="input mt-1 text-left"
          placeholder="••••••••"
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary w-full mt-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        עדכני סיסמה
      </button>
      {state?.error && (
        <p className="text-center text-sm text-muted">
          <Link href="/forgot-password" className="hover-move text-blue-deep font-semibold hover:underline">
            בקשי קישור חדש
          </Link>
        </p>
      )}
    </form>
  );
}
