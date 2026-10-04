"use client";

import { useActionState, useEffect } from "react";
import { createCategory, updateCategory, type AdminActionState } from "@/lib/actions/admin";
import { slugify } from "@/lib/admin-utils";
import type { Status } from "@/db/schema";

export type CategoryFormValues = {
  id?: number;
  title?: string;
  slug?: string;
  description?: string | null;
  questionnaireCode?: string | null;
  icon?: string | null;
  color?: string | null;
  sort?: number;
  bundlePrice?: number | null; // agorot
  status?: Status;
};

export function CategoryForm({
  mode,
  parentId,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  parentId: number | null;
  initial?: CategoryFormValues;
  onDone?: () => void;
}) {
  const action = mode === "create" ? createCategory : updateCategory;
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state?.ok && onDone) onDone();
  }, [state, onDone]);

  return (
    <form
      action={formAction}
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        const f = e.currentTarget;
        const slugEl = f.elements.namedItem("slug") as HTMLInputElement | null;
        const titleEl = f.elements.namedItem("title") as HTMLInputElement | null;
        if (slugEl && titleEl && !slugEl.value.trim()) {
          slugEl.value = slugify(titleEl.value);
        }
      }}
    >
      {mode === "edit" && initial?.id !== undefined && (
        <input type="hidden" name="id" value={initial.id} />
      )}
      {parentId !== null && <input type="hidden" name="parentId" value={parentId} />}

      <label className="text-sm">
        <span className="block mb-1 font-medium">כותרת *</span>
        <input
          name="title"
          required
          defaultValue={initial?.title ?? ""}
          className="input"
          placeholder="למשל: פרשת שמות"
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">
          Slug <span className="text-muted font-normal">(לכתובת; ריק = אוטומטי)</span>
        </span>
        <input
          name="slug"
          defaultValue={initial?.slug ?? ""}
          className="input font-mono"
          dir="ltr"
          placeholder="shemot"
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סמל שאלון</span>
        <input
          name="questionnaireCode"
          defaultValue={initial?.questionnaireCode ?? ""}
          className="input font-mono"
          dir="ltr"
          placeholder="001281"
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סדר</span>
        <input
          name="sort"
          type="number"
          defaultValue={initial?.sort ?? 0}
          className="input"
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">מחיר תיקייה מורחבת (₪)</span>
        <input
          name="bundlePrice"
          type="number"
          step="0.5"
          min={0}
          defaultValue={
            initial?.bundlePrice !== null && initial?.bundlePrice !== undefined
              ? initial.bundlePrice / 100
              : ""
          }
          className="input"
          placeholder="ריק = לא זמין"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block mb-1 font-medium">אייקון</span>
          <input
            name="icon"
            defaultValue={initial?.icon ?? ""}
            className="input"
            placeholder="📜"
          />
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">צבע</span>
          <input
            name="color"
            defaultValue={initial?.color ?? ""}
            className="input font-mono"
            dir="ltr"
            placeholder="#1aa6b7"
          />
        </label>
      </div>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סטטוס</span>
        <select name="status" defaultValue={initial?.status ?? "active"} className="input">
          <option value="active">פעיל</option>
          <option value="suspended">מושהה (כל התיקייה מוסתרת)</option>
          <option value="draft">טיוטה</option>
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="block mb-1 font-medium">תיאור</span>
        <textarea
          name="description"
          rows={2}
          defaultValue={initial?.description ?? ""}
          className="input"
        />
      </label>

      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn btn-oak" disabled={pending}>
          {pending ? "שומרת…" : mode === "create" ? "הוספה" : "שמירה"}
        </button>
        {onDone && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            ביטול
          </button>
        )}
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-green-700">נשמר ✓</span>}
      </div>
    </form>
  );
}
