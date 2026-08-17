"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Material } from "@/db/schema";
import { MATERIAL_KINDS, TIERS, formatPrice } from "@/lib/constants";
import { formatBytes } from "@/lib/admin-utils";
import { deleteMaterial, updateMaterial, type AdminActionState } from "@/lib/actions/admin";

export function MaterialRow({ material: m }: { material: Material }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const kind = MATERIAL_KINDS[m.kind];

  const onDelete = () => {
    if (!confirm(`למחוק את "${m.title}"? הקובץ יימחק גם מהאחסון.`)) return;
    startTransition(async () => {
      const r = await deleteMaterial(m.id);
      if (r?.error) setErr(r.error);
    });
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xl" title={kind.label}>
          {kind.icon}
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{m.title}</div>
          <div className="text-xs text-muted flex flex-wrap gap-x-2">
            <span>{kind.label}</span>
            <span dir="ltr" className="font-mono truncate max-w-[220px]" title={m.fileName}>
              {m.fileName}
            </span>
            <span>{formatBytes(m.size)}</span>
            <span>{m.downloads} הורדות</span>
          </div>
        </div>
        <span className="chip bg-gold-soft text-gold">{formatPrice(m.price)}</span>
        {m.premiumOnly && <span className="chip bg-pink-soft text-pink">פרימיום</span>}
        {m.minTier !== "none" && (
          <span
            className="chip"
            style={{ background: TIERS[m.minTier].color + "22", color: TIERS[m.minTier].color }}
          >
            {TIERS[m.minTier].icon} {TIERS[m.minTier].label}+
          </span>
        )}
        <span className="ms-auto flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost text-xs py-1 px-2.5"
            onClick={() => setEditing((v) => !v)}
          >
            <Pencil className="h-3.5 w-3.5" /> עריכה
          </button>
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 text-red-700 border border-red-200 hover:bg-red-50"
            onClick={onDelete}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" /> {pending ? "מוחקת…" : "מחיקה"}
          </button>
        </span>
        {err && <span className="w-full text-xs text-red-600">{err}</span>}
      </div>
      {editing && <EditForm material={m} onDone={() => setEditing(false)} />}
    </li>
  );
}

function EditForm({ material: m, onDone }: { material: Material; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    async (prev, form) => {
      const r = await updateMaterial(prev, form);
      if (r?.ok) onDone();
      return r;
    },
    undefined,
  );
  return (
    <form
      action={formAction}
      className="mt-3 grid gap-3 sm:grid-cols-2 rounded-xl border border-oak/30 bg-white p-4"
    >
      <input type="hidden" name="id" value={m.id} />
      <label className="text-sm sm:col-span-2">
        <span className="block mb-1 font-medium">כותרת</span>
        <input name="title" defaultValue={m.title} required className="input" />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סוג</span>
        <select name="kind" defaultValue={m.kind} className="input">
          {Object.entries(MATERIAL_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">מחיר (₪)</span>
        <input
          name="price"
          type="number"
          step="0.5"
          min={0}
          defaultValue={m.price / 100}
          className="input"
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">רמת פרימיום מינימלית</span>
        <select name="minTier" defaultValue={m.minTier} className="input">
          {Object.entries(TIERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סדר</span>
        <input name="sort" type="number" defaultValue={m.sort} className="input" />
      </label>
      <label className="text-sm flex items-center gap-2 sm:col-span-2">
        <input name="premiumOnly" type="checkbox" defaultChecked={m.premiumOnly} />
        זמין רק למנויות פרימיום
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="block mb-1 font-medium">תיאור</span>
        <textarea name="description" rows={2} defaultValue={m.description ?? ""} className="input" />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn btn-oak" disabled={pending}>
          {pending ? "שומרת…" : "שמירה"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          ביטול
        </button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
