"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, Loader2, PlugZap } from "lucide-react";
import { saveGeminiKeys, testGeminiPool, type GeminiAdminState } from "@/lib/actions/gemini";

type PoolStatus = {
  source: "env" | "db" | "none";
  envOverridesDb: boolean;
  models: string[];
  keys: { key: string; ok: number; fail: number; last: number | string | null; lastAt: string | null; coolingSec: number }[];
};

/**
 * מאגר המפתחות של ג'מיני (/admin/fixes): מצב (מקור, מודלים, לכל מפתח הצלחות/כשלים/התקררות – רק סיומת של 4 תווים),
 * בדיקת מפתחות, והחלפת המאגר בלי פריסה (נשמר מוצפן). הערכים עצמם לא חוזרים לעולם ללקוח.
 * הסטטיסטיקה היא של המופע הנוכחי של השרת בלבד.
 */
export function GeminiPoolCard({ status }: { status: PoolStatus }) {
  const [state, formAction, pending] = useActionState<GeminiAdminState, FormData>(saveGeminiKeys, undefined);
  const [busy, startTest] = useTransition();
  const [test, setTest] = useState<GeminiAdminState>(undefined);
  const [formKey, setFormKey] = useState(0);
  const shown = test ?? state;
  const sourceLabel = status.source === "env" ? "משתני סביבה" : status.source === "db" ? "האתר (מוצפן)" : "לא מוגדר";

  return (
    <details className="card p-4 text-sm space-y-3">
      <summary className="cursor-pointer font-bold">
        <KeyRound className="inline h-4 w-4 ml-1 text-oak-deep" aria-hidden />
        חיבור ג&apos;מיני (מאגר מפתחות) – {status.keys.length ? `${status.keys.length} מפתחות` : "לא מוגדר"}
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`chip ${status.keys.length ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
            {status.keys.length ? "מחובר" : "לא מחובר"}
          </span>
          <span className="chip bg-gray-100 text-gray-700">מקור: {sourceLabel}</span>
          {status.envOverridesDb && <span className="chip bg-yellow-100 text-yellow-800">משתני הסביבה דורסים את מה ששמור באתר</span>}
        </div>
        <p className="text-xs text-muted">
          סדר המודלים (מהראשון): {status.models.join(" › ")}. מפתח שנכשל יוצא להתקררות קצרה והמנוע עובר למפתח הבא, ורק אחרי שכולם
          נכשלו – למודל הבא.
        </p>
        {status.keys.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-right text-muted">
                <th>מפתח</th>
                <th>הצלחות</th>
                <th>כשלים</th>
                <th>סטטוס אחרון</th>
                <th>התקררות (שנ&apos;)</th>
              </tr>
            </thead>
            <tbody>
              {status.keys.map((k) => (
                <tr key={k.key}>
                  <td dir="ltr">{k.key}</td>
                  <td>{k.ok}</td>
                  <td>{k.fail}</td>
                  <td>{k.last ?? "—"}</td>
                  <td>{k.coolingSec || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost text-sm py-1"
            disabled={busy || status.keys.length === 0}
            onClick={() => {
              setTest(undefined);
              startTest(async () => setTest(await testGeminiPool()));
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}
            בדיקת כל המפתחות
          </button>
        </div>
        {shown?.tests && (
          <ul className="text-xs" dir="ltr">
            {shown.tests.map((t) => (
              <li key={t.key} className={t.status === 200 ? "text-green-700" : "text-red-700"}>
                {t.key}: {t.status} ({t.ms}ms)
              </li>
            ))}
          </ul>
        )}
        <form
          action={(fd) => {
            setTest(undefined);
            formAction(fd);
            setFormKey((k) => k + 1);
          }}
          className="space-y-2"
          key={formKey}
        >
          <label className="block text-xs">
            החלפת המאגר (מפתח בכל שורה או מופרדים בפסיק; ריק = מחיקה מהאתר)
            <textarea name="keys" rows={3} dir="ltr" autoComplete="off" spellCheck={false} className="mt-1 w-full rounded-lg border border-foreground/20 p-2 font-mono text-xs" />
          </label>
          <button type="submit" className="btn btn-gold text-sm py-1" disabled={pending}>
            {pending ? "שומרת…" : "שמירת המאגר"}
          </button>
        </form>
        {shown?.error && <p className="text-xs text-red-700">{shown.error}</p>}
        {shown?.ok && shown.message && <p className="text-xs text-green-700">{shown.message}</p>}
      </div>
    </details>
  );
}
