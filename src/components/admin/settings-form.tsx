"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertTriangle, Save, Trash2, Wrench } from "lucide-react";
import { updateSettings, toggleMaintenance, purgeOldLogs } from "@/lib/actions/settings";
import type { AdminActionState } from "@/lib/actions/admin";

export type SettingDefClient = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean";
  default: string;
  group: string;
};

export function SettingsForm({
  defs,
  values,
  purgeInfo,
}: {
  defs: SettingDefClient[];
  values: Record<string, string>;
  purgeInfo: { days: number; total: number };
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    updateSettings,
    undefined,
  );
  const groups = Array.from(new Set(defs.map((d) => d.group)));
  const maintenance = values.maintenance_mode === "true";

  return (
    <div className="space-y-6">
      <MaintenanceToggle on={maintenance} />

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="__keys" value={defs.map((d) => d.key).join(",")} />
        {groups.map((g) => (
          <section key={g} className="card p-5">
            <h3 className="font-bold text-lg mb-4">{g}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {defs
                .filter((d) => d.group === g)
                .map((d) => (
                  <Field key={d.key} def={d} value={values[d.key] ?? d.default} />
                ))}
            </div>
          </section>
        ))}
        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl bg-white/90 backdrop-blur border border-oak/30 p-3 shadow-soft">
          <button className="btn btn-oak" disabled={pending}>
            <Save className="h-4 w-4" /> {pending ? "שומרת…" : "שמירת כל ההגדרות"}
          </button>
          {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
          {state?.ok && <span className="text-sm text-green-700">ההגדרות נשמרו ✓</span>}
        </div>
      </form>

      <DangerZone info={purgeInfo} />
    </div>
  );
}

function Field({ def, value }: { def: SettingDefClient; value: string }) {
  const isDefault = value === def.default;
  const hint = (
    <span className="block mt-1 text-[11px] text-muted">
      ערך ברירת מחדל:{" "}
      <code className="font-mono bg-oak-soft/60 px-1 rounded" dir="auto">
        {def.type === "boolean" ? (def.default === "true" ? "פעיל" : "כבוי") : def.default || "(ריק)"}
      </code>
      {!isDefault && <span className="ms-2 text-oak-deep">· שונה</span>}
    </span>
  );

  if (def.type === "boolean") {
    return (
      <label className="text-sm flex items-start gap-3 rounded-xl border border-foreground/5 p-3 hover:bg-oak-soft/30 cursor-pointer">
        <Toggle name={def.key} defaultChecked={value === "true"} />
        <span>
          <span className="font-medium block">{def.label}</span>
          {hint}
        </span>
      </label>
    );
  }
  if (def.type === "textarea") {
    return (
      <label className="text-sm sm:col-span-2">
        <span className="block mb-1 font-medium">{def.label}</span>
        <textarea name={def.key} rows={3} defaultValue={value} className="input" />
        {hint}
      </label>
    );
  }
  return (
    <label className="text-sm">
      <span className="block mb-1 font-medium">{def.label}</span>
      <input
        name={def.key}
        type={def.type === "number" ? "number" : "text"}
        step={def.type === "number" ? "any" : undefined}
        defaultValue={value}
        className="input"
        dir={def.type === "number" ? "ltr" : undefined}
      />
      {hint}
    </label>
  );
}

/** מתג boolean – שולח "true"/"false" תמיד (דרך checkbox עם value=true) */
function Toggle({ name, defaultChecked }: { name: string; defaultChecked: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <span className="relative inline-flex shrink-0 mt-0.5">
      <input
        type="checkbox"
        name={name}
        value="true"
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`h-6 w-11 rounded-full transition-colors ${on ? "bg-oak" : "bg-gray-300"} peer-focus-visible:ring-2 ring-oak/50`}
      />
      <span
        aria-hidden
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "end-0.5" : "end-[22px]"}`}
      />
    </span>
  );
}

function MaintenanceToggle({ on }: { on: boolean }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div
      className={`card p-5 flex flex-wrap items-center gap-4 border-2 ${
        on ? "border-red-300 bg-red-50/60" : "border-oak/30"
      }`}
    >
      <span className={`grid h-12 w-12 place-items-center rounded-2xl ${on ? "bg-red-100 text-red-700" : "bg-oak-soft text-oak-deep"}`}>
        <Wrench className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-lg">
          מצב תחזוקה {on ? <span className="chip bg-red-100 text-red-700 ms-2">פעיל – האתר סגור למשתמשות</span> : <span className="chip bg-green-100 text-green-800 ms-2">כבוי – האתר פתוח</span>}
        </div>
        <p className="text-sm text-muted">
          כשמצב התחזוקה פעיל, המשתמשות רואות רק את הודעת התחזוקה. המנהלת ממשיכה לראות את האתר כרגיל.
        </p>
        {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
      </div>
      <button
        type="button"
        className={`btn ${on ? "btn-oak" : "text-red-700 border border-red-300 hover:bg-red-50"}`}
        disabled={pending}
        onClick={() => {
          if (!on && !confirm("להפעיל מצב תחזוקה? האתר ייסגר למשתמשות מיד.")) return;
          startTransition(async () => {
            const r = await toggleMaintenance();
            if (r?.error) setErr(r.error);
          });
        }}
      >
        {pending ? "…" : on ? "כיבוי מצב תחזוקה" : "הפעלת מצב תחזוקה"}
      </button>
    </div>
  );
}

function DangerZone({ info }: { info: { days: number; total: number } }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="card p-5 border-2 border-red-200">
      <h3 className="font-bold text-lg mb-1 text-red-700 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5" /> אזור מסוכן
      </h3>
      <p className="text-sm text-muted mb-4">פעולות בלתי הפיכות. שימי לב לפני לחיצה.</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm">
          <div className="font-medium">מחיקת לוגים ישנים</div>
          <div className="text-xs text-muted">
            ימחקו היסטוריית גלישה, לוג פעולות ולוג מיילים ישנים מ-{info.days} ימים (לפי &quot;שמירת לוגים&quot;). כרגע:{" "}
            <b>{info.total.toLocaleString("he-IL")}</b> רשומות.
          </div>
        </div>
        <button
          type="button"
          className="btn text-sm text-red-700 border border-red-300 hover:bg-red-50 ms-auto"
          disabled={pending || info.total === 0}
          onClick={() => {
            if (!confirm(`למחוק לצמיתות ${info.total} רשומות לוג ישנות מ-${info.days} ימים?`)) return;
            startTransition(async () => {
              const r = await purgeOldLogs();
              setMsg(r?.error ? r.error : `נמחקו ${r?.deleted ?? 0} רשומות`);
            });
          }}
        >
          <Trash2 className="h-4 w-4" /> {pending ? "מוחקת…" : "מחיקת לוגים ישנים"}
        </button>
        {msg && <span className="w-full text-sm text-oak-deep">{msg}</span>}
      </div>
    </section>
  );
}
