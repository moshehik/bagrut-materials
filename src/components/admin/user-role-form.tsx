"use client";

import { useActionState, useState, useTransition } from "react";
import { Ban, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import {
  updateUser,
  suspendUser,
  unsuspendUser,
  type AdminActionState,
} from "@/lib/actions/admin";

export function UserRoleForm({
  id,
  role,
  dailyDownloadLimit = null,
  notes = null,
  suspended = false,
  suspendReason = null,
  isSelf = false,
}: {
  id: number;
  role: "user" | "admin";
  dailyDownloadLimit?: number | null;
  notes?: string | null;
  suspended?: boolean;
  suspendReason?: string | null;
  isSelf?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    updateUser,
    undefined,
  );
  const [more, setMore] = useState(false);
  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <select name="role" defaultValue={role} className="input py-1 w-auto text-xs">
          <option value="user">משתמשת</option>
          <option value="admin">מנהלת</option>
        </select>
        <button
          type="button"
          className="btn btn-ghost text-xs py-1 px-2"
          onClick={() => setMore((v) => !v)}
          title="הגבלות והערות"
        >
          {more ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          עוד
        </button>
        {more && (
          <div className="w-full grid gap-2 sm:grid-cols-[160px_1fr] mt-1">
            <label className="text-xs">
              <span className="block mb-0.5 text-muted">מגבלת הורדות יומית</span>
              <input
                name="dailyDownloadLimit"
                type="number"
                min={0}
                defaultValue={dailyDownloadLimit ?? ""}
                placeholder="ברירת מחדל"
                className="input py-1 text-xs"
              />
            </label>
            <label className="text-xs">
              <span className="block mb-0.5 text-muted">הערות פנימיות</span>
              <textarea
                name="notes"
                rows={2}
                defaultValue={notes ?? ""}
                className="input py-1 text-xs"
              />
            </label>
          </div>
        )}
        <button className="btn btn-oak text-xs py-1 px-3" disabled={pending}>
          {pending ? "…" : "עדכון"}
        </button>
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-xs text-green-700">✓</span>}
      </form>
      {!isSelf && <SuspendControls id={id} suspended={suspended} suspendReason={suspendReason} />}
    </div>
  );
}

function SuspendControls({
  id,
  suspended,
  suspendReason,
}: {
  id: number;
  suspended: boolean;
  suspendReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [state, formAction, formPending] = useActionState<AdminActionState, FormData>(
    async (prev, form) => {
      const r = await suspendUser(prev, form);
      if (r?.ok) setOpen(false);
      return r;
    },
    undefined,
  );

  if (suspended) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip bg-red-100 text-red-700">
          <Ban className="h-3 w-3" /> מושהית
        </span>
        {suspendReason && <span className="text-muted">סיבה: {suspendReason}</span>}
        <button
          type="button"
          className="btn btn-ghost text-xs py-1 px-2"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await unsuspendUser(id);
              if (r?.error) setErr(r.error);
            })
          }
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {pending ? "…" : "ביטול השהיה"}
        </button>
        {err && <span className="text-red-600">{err}</span>}
      </div>
    );
  }

  return (
    <div className="text-xs">
      {!open ? (
        <button
          type="button"
          className="btn text-xs py-1 px-2 text-red-700 border border-red-200 hover:bg-red-50"
          onClick={() => setOpen(true)}
        >
          <Ban className="h-3.5 w-3.5" /> השהיה
        </button>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input
            name="reason"
            placeholder="סיבת ההשהיה (אופציונלי)"
            className="input py-1 text-xs w-56"
            autoFocus
          />
          <button
            className="btn text-xs py-1 px-2 text-red-700 border border-red-200 hover:bg-red-50"
            disabled={formPending}
          >
            {formPending ? "…" : "אישור השהיה"}
          </button>
          <button type="button" className="btn btn-ghost text-xs py-1 px-2" onClick={() => setOpen(false)}>
            ביטול
          </button>
          {state?.error && <span className="text-red-600">{state.error}</span>}
        </form>
      )}
    </div>
  );
}
