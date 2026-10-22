"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, Loader2, PlugZap, Trash2 } from "lucide-react";
import type { SecretStatus } from "@/lib/nedarim/secrets";
import { removeNedarimSecret, setNedarimSecret, testNedarimApiKey, type SecretActionState } from "@/lib/actions/nedarim-admin";

/**
 * כרטיסי הסודות של נדרים פלוס ב-/admin/payments: מצב (מוגדר/לא, מקור DB/env, מתי ועל ידי מי, 4 תווים אחרונים), שדה
 * write-only להחלפה (הערך לא חוזר לעולם – לא ב-HTML, לא ב-props, לא בתשובת ה-action), "בדיקת מפתח" (למפתח ה-API),
 * ו"הסרה מה-DB". הכרטיס מקבל רק SecretStatus – בלי ערכים.
 */
const fmt = (d: Date | null) => (d ? d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—");

function SecretCard({ s, testable }: { s: SecretStatus; testable: boolean }) {
  const [state, formAction, pending] = useActionState<SecretActionState, FormData>(setNedarimSecret, undefined);
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<SecretActionState>(undefined);
  const [formKey, setFormKey] = useState(0);
  const shown = msg ?? state;

  const run = (fn: () => Promise<SecretActionState>) => {
    setMsg(undefined);
    startTransition(async () => setMsg(await fn()));
  };

  return (
    <div className="rounded-xl border border-foreground/10 p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="h-4 w-4 text-oak-deep" aria-hidden />
        <span className="font-bold">{s.label}</span>
        <span className={`chip ${s.configured ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
          {s.configured ? "מוגדר" : "לא מוגדר"}
        </span>
        {s.source && <span className="chip bg-gray-100 text-gray-700">מקור: {s.source === "db" ? "האתר (מוצפן)" : "משתני סביבה"}</span>}
        {s.undecryptable && <span className="chip bg-red-100 text-red-700">הערך השמור לא ניתן לפענוח (מפתח ההצפנה הוחלף?) – להזין מחדש</span>}
        {s.envAlsoSet && <span className="chip bg-yellow-100 text-yellow-800">הערך מהאתר דורס את משתני הסביבה</span>}
      </div>
      {s.source === "db" && (
        <p className="text-xs text-muted">
          {s.last4 ? (
            <>
              מסתיים ב-<code dir="ltr">••••{s.last4}</code> ·{" "}
            </>
          ) : null}
          הוחלף {fmt(s.updatedAt)}
          {s.updatedBy ? ` על ידי ${s.updatedBy}` : ""}
        </p>
      )}
      <form key={formKey} action={(fd) => { setMsg(undefined); formAction(fd); setFormKey((k) => k + 1); }} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="name" value={s.name} />
        <label className="flex-1 min-w-[240px]">
          <span className="block text-xs text-muted mb-1">{s.configured ? "החלפה (הערך החדש דורס את הקודם)" : "הזנת ערך"}</span>
          <input
            name="value"
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            className="input py-1 text-xs"
            dir="ltr"
            placeholder={s.hint}
            aria-label={s.label}
          />
        </label>
        <button type="submit" className="btn btn-oak text-xs py-1.5 px-3" disabled={pending || busy}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} שמירה מוצפנת
        </button>
        {testable && s.configured && (
          <button type="button" className="btn btn-ghost text-xs py-1.5 px-3" disabled={pending || busy} onClick={() => run(testNedarimApiKey)} title="קריאה אחת ל-API של נדרים (מוגבל ל-20 בשעה)">
            <PlugZap className="h-3.5 w-3.5" /> בדיקת מפתח
          </button>
        )}
        {s.source === "db" && (
          <button
            type="button"
            className="btn text-xs py-1.5 px-3 text-red-700 border border-red-200 hover:bg-red-50"
            disabled={pending || busy}
            onClick={() => {
              if (confirm(`להסיר את "${s.label}" מה-DB?${s.envAlsoSet ? " (הערך ממשתני הסביבה יחזור לתוקף)" : " לא יהיה ערך בתוקף."}`)) run(() => removeNedarimSecret(s.name));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> הסרה
          </button>
        )}
      </form>
      {shown?.error && <p className="text-xs text-red-600">{shown.error}</p>}
      {shown?.ok && <p className="text-xs text-green-700">{shown.message}</p>}
    </div>
  );
}

export function NedarimSecretsCard({ statuses }: { statuses: SecretStatus[] }) {
  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-bold">סודות נדרים פלוס – החלפה בלי פריסה</h3>
        <p className="text-xs text-muted mt-1">
          הערכים נשמרים מוצפנים (AES-256-GCM) בטבלת app_secrets ונכנסים לתוקף מיד. ערך שנשמר כאן גובר על משתני הסביבה ב-Vercel.
          הערך עצמו לא מוצג לעולם – רק 4 התווים האחרונים. קוד המוסד (NEDARIM_MOSAD_ID) אינו סוד ונשאר במשתני הסביבה.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-1">
        {statuses.map((s) => (
          <SecretCard key={s.name} s={s} testable={s.name === "nedarim_api_password"} />
        ))}
      </div>
    </div>
  );
}
