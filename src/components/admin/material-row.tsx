"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2, PauseCircle, PlayCircle } from "lucide-react";
import type { Material } from "@/db/schema";
import { MATERIAL_KINDS, formatPrice } from "@/lib/constants";
import { formatBytes } from "@/lib/admin-utils";
import {
  deleteMaterial,
  updateMaterial,
  toggleMaterialStatus,
  type AdminActionState,
} from "@/lib/actions/admin";

export const ACCESS_LABELS: Record<Material["access"], { label: string; className: string }> = {
  free: { label: "חינם", className: "bg-green-100 text-green-800" },
  paid: { label: "בתשלום", className: "bg-gold-soft text-gold" },
  tier: { label: "לפי רמה", className: "bg-blue-soft text-blue-deep" },
  premium: { label: "פרימיום", className: "bg-pink-soft text-pink" },
};

export const STATUS_LABELS: Record<Material["status"], { label: string; className: string }> = {
  active: { label: "פעיל", className: "bg-green-100 text-green-800" },
  suspended: { label: "מושהה", className: "bg-red-100 text-red-700" },
  draft: { label: "טיוטה", className: "bg-gray-100 text-gray-700" },
};

export function MaterialRow({ material: m }: { material: Material }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const kind = MATERIAL_KINDS[m.kind];
  const access = ACCESS_LABELS[m.access];
  const status = STATUS_LABELS[m.status];

  const onDelete = () => {
    if (!confirm(`למחוק את "${m.title}"? הקובץ יימחק גם מהאחסון.`)) return;
    startTransition(async () => {
      const r = await deleteMaterial(m.id);
      if (r?.error) setErr(r.error);
    });
  };

  const onToggle = () => {
    startTransition(async () => {
      const r = await toggleMaterialStatus(m.id);
      if (r?.error) setErr(r.error);
    });
  };

  return (
    <li className={`py-3 ${m.status !== "active" ? "opacity-70" : ""}`}>
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
            {m.maxDownloadsPerUser !== null && <span>עד {m.maxDownloadsPerUser} למשתמשת</span>}
          </div>
        </div>
        {m.status !== "active" && <span className={`chip ${status.className}`}>{status.label}</span>}
        <span className={`chip ${access.className}`}>{access.label}</span>
        {m.access !== "free" && <span className="chip bg-gold-soft text-gold">{formatPrice(m.price)}</span>}
        {m.premiumOnly && <span className="chip bg-pink-soft text-pink">פרימיום</span>}
        {!m.allowDownload && <span className="chip bg-gray-100 text-gray-700">צפייה בלבד</span>}
        {m.allowPreview && <span className="chip bg-blue-soft text-blue-deep">תצוגה מקדימה</span>}
        <span className="ms-auto flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost text-xs py-1 px-2.5"
            onClick={onToggle}
            disabled={pending}
            title={m.status === "active" ? "השהיית החומר – יוסתר מהמשתמשות" : "הפעלת החומר"}
          >
            {m.status === "active" ? (
              <>
                <PauseCircle className="h-3.5 w-3.5" /> השהיה
              </>
            ) : (
              <>
                <PlayCircle className="h-3.5 w-3.5" /> הפעלה
              </>
            )}
          </button>
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
            <Trash2 className="h-3.5 w-3.5" /> {pending ? "…" : "מחיקה"}
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
      className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-oak/30 bg-white p-4"
    >
      <input type="hidden" name="id" value={m.id} />
      <label className="text-sm sm:col-span-2 lg:col-span-3">
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
        <span className="block mb-1 font-medium">סדר</span>
        <input name="sort" type="number" defaultValue={m.sort} className="input" />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">דירוג גישה</span>
        <select name="access" defaultValue={m.access} className="input">
          <option value="free">חינם (לכל מחוברת)</option>
          <option value="paid">בתשלום (רכישה / מנוי)</option>
          <option value="premium">פרימיום בלבד</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סטטוס</span>
        <select name="status" defaultValue={m.status} className="input">
          <option value="active">פעיל</option>
          <option value="suspended">מושהה</option>
          <option value="draft">טיוטה</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">מגבלת הורדות למשתמשת</span>
        <input
          name="maxDownloadsPerUser"
          type="number"
          min={0}
          defaultValue={m.maxDownloadsPerUser ?? ""}
          placeholder="ריק = ללא"
          className="input"
        />
      </label>
      <div className="text-sm flex flex-wrap items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2">
          <input name="premiumOnly" type="checkbox" defaultChecked={m.premiumOnly} />
          זמין רק למנויות פרימיום
        </label>
        <label className="flex items-center gap-2">
          <input name="allowDownload" type="checkbox" defaultChecked={m.allowDownload} />
          ניתן להורדה (אחרת: צפייה בלבד)
        </label>
        <label className="flex items-center gap-2">
          <input name="allowPreview" type="checkbox" defaultChecked={m.allowPreview} />
          תצוגה מקדימה ללא רכישה
        </label>
      </div>
      <label className="text-sm sm:col-span-2 lg:col-span-3">
        <span className="block mb-1 font-medium">תיאור</span>
        <textarea name="description" rows={2} defaultValue={m.description ?? ""} className="input" />
      </label>
      <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
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
