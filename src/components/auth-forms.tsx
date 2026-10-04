"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { LogIn, UserPlus, Loader2, AlertCircle, FingerprintPattern, KeyRound, MailCheck, CheckCircle2, Check } from "lucide-react";
import { loginAction, registerAction } from "@/lib/actions/auth";
import { requestPasswordReset, resetPassword } from "@/lib/actions/password";
import { completeProfileAction } from "@/lib/actions/profile";
import { ISRAEL_CITIES, canonicalCity } from "@/lib/israel-cities";

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
function GoogleButton({
  next,
  enabled,
  tip,
  divider = true,
}: {
  next?: string;
  enabled?: boolean;
  /** טולטיפ בריחוף (data-tip הכללי של האתר) */
  tip?: string;
  divider?: boolean;
}) {
  if (!enabled) return null;
  const href = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="space-y-4">
      <a href={href} className="btn btn-google w-full" data-tip={tip}>
        <GoogleIcon />
        המשך עם Google
      </a>
      {divider && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-blue/10" />
          או במייל
          <span className="h-px flex-1 bg-blue/10" />
        </div>
      )}
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

/** שדה טקסט בעיצוב "שער" (חלונית כחולה, שדה זהב בהיר במסגרת שחורה) */
function GateField({
  label,
  hint,
  ltr,
  ...input
}: { label: string; hint?: string; ltr?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-xl">{label}</span>
      <input {...input} dir={ltr ? "ltr" : undefined} className={`gate-input mt-1 ${ltr ? "text-left" : ""}`} />
      {hint && <span className="block text-base text-[#ffd45a]">{hint}</span>}
    </label>
  );
}

/** ריבוע וי בעיצוב כרטיס "שער" (כמו בחירת מקצוע ברכישת מנוי) */
function GateCheck({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={`gate-card gate-pick ${checked ? "gate-pick-on" : ""}`}>
      <input
        type="checkbox"
        name={name}
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="gate-check" aria-hidden>
        {checked && <Check className="h-5 w-5" strokeWidth={3} />}
      </span>
      <span className="flex-1 text-lg leading-snug">{children}</span>
    </label>
  );
}

/** תבנית לשם אדם — תואמת ל-NAME_RE בשרת (אותיות, רווח, גרש, מקף) */
const NAME_PATTERN = "[\\u05D0-\\u05EAa-zA-Z][\\u05D0-\\u05EAa-zA-Z '\"\\u05F3\\u05F4\\-]*";

/** "עיר מגורים": שדה עם רשימה נגללת מעוצבת (פילטור תוך כדי הקלדה); ערך שאינו ברשימה נחסם גם בדפדפן וגם בשרת */
function CityField() {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const canonical = value ? canonicalCity(value) : null;
  const invalid = touched && value !== "" && !canonical;

  const q = value.trim();
  const matches = useMemo(() => {
    if (!q) return ISRAEL_CITIES;
    const starts = ISRAEL_CITIES.filter((c) => c.startsWith(q));
    const rest = ISRAEL_CITIES.filter((c) => !c.startsWith(q) && c.includes(q));
    return [...starts, ...rest];
  }, [q]);

  // תקינות דפדפן: הערך חייב להיות יישוב מהרשימה
  useEffect(() => {
    inputRef.current?.setCustomValidity(!value || canonical ? "" : "יש לבחור עיר מהרשימה");
  }, [value, canonical]);

  // הפריט הפעיל תמיד גלוי בתוך הרשימה
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (c: string) => {
    setValue(c);
    setOpen(false);
    setTouched(true);
  };

  return (
    <div className="block">
      <label htmlFor="city-input" className="text-xl">
        עיר מגורים
      </label>
      <div className="city-combo">
        <input
          ref={inputRef}
          id="city-input"
          name="city"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="city-listbox"
          aria-autocomplete="list"
          autoComplete="off"
          required
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            setValue(canonicalCity(v) ?? v);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTouched(true);
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && open && matches[active]) {
              e.preventDefault();
              choose(matches[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          aria-invalid={invalid}
          className="gate-input mt-1"
        />
        {open && (
          <div className="city-pop" dir="ltr">
            {matches.length === 0 ? (
              <p className="city-empty" dir="rtl">
                לא נמצאה עיר בשם הזה
              </p>
            ) : (
              <ul id="city-listbox" role="listbox" ref={listRef}>
                {matches.map((c, i) => {
                  const at = q ? c.indexOf(q) : -1;
                  return (
                    <li
                      key={c}
                      role="option"
                      dir="rtl"
                      aria-selected={i === active}
                      className={`city-opt ${i === active ? "city-opt-on" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(c);
                      }}
                      onMouseMove={() => i !== active && setActive(i)}
                    >
                      {at >= 0 ? (
                        <>
                          {c.slice(0, at)}
                          <b>{c.slice(at, at + q.length)}</b>
                          {c.slice(at + q.length)}
                        </>
                      ) : (
                        c
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      <span className={`block text-base ${invalid ? "text-[#ffd45a]" : "opacity-80"}`}>
        {invalid ? "לא נמצאה עיר בשם הזה — בחרי מהרשימה." : "התחילי להקליד ובחרי את העיר מהרשימה."}
      </span>
    </div>
  );
}

export function RegisterForm({ next, googleEnabled }: { next?: string; googleEnabled?: boolean }) {
  const [state, action, pending] = useActionState(registerAction, undefined);
  const [marketing, setMarketing] = useState(false);
  const [terms, setTerms] = useState(false);
  // עם גוגל זמין: קודם בחירה (גוגל / "דלג"), והטופס הידני נפתח רק אחרי "דלג". בלי גוגל – ישר הטופס.
  const [skipped, setSkipped] = useState(false);
  const manual = !googleEnabled || skipped;
  return (
    <div className="space-y-6">
      <div className="gate-google">
        <GoogleButton
          next={next}
          enabled={googleEnabled}
          divider={false}
          tip="הרשמה דרך גוגל חוסכת ממך לבחור סיסמה, לזכור אותה ולמלא שם פרטי, שם משפחה וכתובת מייל."
        />
      </div>
      {!manual && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setSkipped(true)}
            className="btn gate-skip py-2"
            data-tip="אפשר גם להירשם בלי גוגל – ממלאים בעצמך את כל הפרטים ובוחרים סיסמה."
          >
            דלג – אמלא את הפרטים בעצמי
          </button>
        </div>
      )}
      {manual && (
      <form action={action} className="space-y-5">
        {state?.error && (
          <div role="alert" className="gate-strip gate-strip-alert animate-pop">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            <span className="flex-1">{state.error}</span>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <GateField
            label="שם פרטי"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            minLength={2}
            pattern={NAME_PATTERN}
            title="אותיות בלבד (בלי מספרים וסימנים)"
          />
          <GateField
            label="שם משפחה"
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
            minLength={2}
            pattern={NAME_PATTERN}
            title="אותיות בלבד (בלי מספרים וסימנים)"
          />
        </div>
        <CityField />
        <GateField
          label="שם התיכון בו את מלמדת"
          name="school"
          type="text"
          required
          minLength={2}
          autoComplete="organization"
        />
        <GateField
          label="כתובת מייל"
          name="email"
          type="email"
          autoComplete="email"
          required
          ltr
          placeholder="you@example.com"
        />
        <GateField
          label="מספר טלפון"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          ltr
          placeholder="050-1234567"
          hint="הטלפון, השם והמייל מוטבעים בסימן המים של הקבצים שתורידי."
        />
        <GateField
          label="סיסמה"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          ltr
          placeholder="6 תווים לפחות"
        />

        <div className="space-y-3 pt-1">
          <GateCheck name="marketing" checked={marketing} onChange={setMarketing}>
            אני מאשרת קבלת דיוור ועדכונים במייל (אפשר לבטל בכל עת)
          </GateCheck>
          <GateCheck name="terms" checked={terms} onChange={setTerms}>
            אני מתחייבת לתקנון האתר.{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-semibold underline"
              onClick={(e) => e.stopPropagation()}
            >
              לקריאת התקנון
            </Link>{" "}
            <span className="text-sm text-gray-500">(חובה)</span>
          </GateCheck>
        </div>

        <div className="text-center">
          <button type="submit" disabled={pending || !terms} className="btn btn-gold btn-gate py-2 disabled:opacity-50">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" aria-hidden />}
            צרי חשבון
          </button>
          {!terms && <p className="mt-2 text-[#ffd45a]">כדי להירשם יש לסמן את אישור התקנון.</p>}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-base opacity-80">
            <FingerprintPattern className="h-5 w-5 shrink-0" aria-hidden />
            עם ההרשמה תקבלי מספר אישי שיוטבע על כל קובץ שתורידי
          </p>
          <p className="mt-3">
            כבר רשומה?{" "}
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="font-semibold text-[#ffd45a] underline"
            >
              התחברי
            </Link>
          </p>
        </div>
      </form>
      )}
      {!manual && (
        <p className="text-center">
          כבר רשומה?{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="font-semibold text-[#ffd45a] underline"
          >
            התחברי
          </Link>
        </p>
      )}
    </div>
  );
}

/** השלמת פרטים אחרי הרשמה דרך גוגל: עיר, תיכון וטלפון – הכל חובה (גוגל לא מוסר אותם) */
export function CompleteProfileForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(completeProfileAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      {state?.error && (
        <div role="alert" className="gate-strip gate-strip-alert animate-pop">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex-1">{state.error}</span>
        </div>
      )}
      <CityField />
      <GateField
        label="שם התיכון בו את מלמדת"
        name="school"
        type="text"
        required
        minLength={2}
        autoComplete="organization"
      />
      <GateField
        label="מספר טלפון"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        ltr
        placeholder="050-1234567"
        hint="הטלפון, השם והמייל מוטבעים בסימן המים של הקבצים שתורידי."
      />
      <div className="text-center">
        <button type="submit" disabled={pending} className="btn btn-gold btn-gate py-2 disabled:opacity-50">
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" aria-hidden />}
          סיום הרשמה
        </button>
      </div>
    </form>
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
