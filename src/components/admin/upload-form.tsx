"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { CloudUpload, FileCheck2, X } from "lucide-react";
import type { Access, MaterialKind, Status, Tier } from "@/db/schema";
import { MATERIAL_KINDS, TIERS } from "@/lib/constants";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  detectKind,
  formatBytes,
  stripExtension,
} from "@/lib/admin-utils";
import { createMaterial } from "@/lib/actions/admin";

type Item = {
  key: string;
  file: File;
  title: string;
  kind: MaterialKind;
  status: "idle" | "uploading" | "saving" | "done" | "error";
  progress: number;
  error?: string;
};

export function UploadForm({ categoryId }: { categoryId: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [price, setPrice] = useState("15");
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [minTier, setMinTier] = useState<Tier>("none");
  const [access, setAccess] = useState<Access>("paid");
  const [status, setStatus] = useState<Status>("active");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const addFiles = (files: FileList | File[]) => {
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_UPLOAD_BYTES) {
        next.push({
          key: `${f.name}-${f.size}-${Math.random()}`,
          file: f,
          title: stripExtension(f.name),
          kind: detectKind(f.name),
          status: "error",
          progress: 0,
          error: "הקובץ גדול מ-200MB",
        });
        continue;
      }
      next.push({
        key: `${f.name}-${f.size}-${Math.random()}`,
        file: f,
        title: stripExtension(f.name),
        kind: detectKind(f.name),
        status: "idle",
        progress: 0,
      });
    }
    setItems((prev) => [...prev, ...next]);
  };

  const patch = (key: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const remove = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const startUpload = async () => {
    setBusy(true);
    const queue = items.filter((it) => it.status === "idle" || it.status === "error");
    for (const it of queue) {
      if (it.file.size > MAX_UPLOAD_BYTES) continue;
      try {
        patch(it.key, { status: "uploading", progress: 0, error: undefined });
        const blob = await upload(it.file.name, it.file, {
          access: "private",
          handleUploadUrl: "/api/admin/upload",
          clientPayload: JSON.stringify({ categoryId }),
          contentType: it.file.type || "application/octet-stream",
          onUploadProgress: ({ percentage }) => patch(it.key, { progress: percentage }),
        });
        patch(it.key, { status: "saving", progress: 100 });
        const r = await createMaterial({
          categoryId,
          title: it.title.trim() || stripExtension(it.file.name),
          description: description.trim() || undefined,
          kind: it.kind,
          fileUrl: blob.url,
          fileName: it.file.name,
          mime: it.file.type || blob.contentType || "application/octet-stream",
          size: it.file.size,
          price: price === "" ? undefined : Number(price),
          premiumOnly,
          minTier,
          access,
          status,
        });
        if (r?.error) throw new Error(r.error);
        patch(it.key, { status: "done" });
      } catch (e) {
        patch(it.key, {
          status: "error",
          error: e instanceof Error ? e.message : "שגיאה בהעלאה",
        });
      }
    }
    setBusy(false);
    router.refresh();
  };

  const pendingCount = items.filter((it) => it.status === "idle" || it.status === "error").length;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          drag ? "border-blue bg-blue-soft" : "border-oak/40 bg-oak-soft/40"
        }`}
      >
        <CloudUpload className="mx-auto h-8 w-8 text-oak-deep" aria-hidden />
        <p className="mt-2 font-medium">גררי קבצים לכאן או</p>
        <button
          type="button"
          className="btn btn-oak mt-2"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          בחירת קבצים
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALLOWED_UPLOAD_TYPES.join(",")}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-muted">
          PDF, Word, PowerPoint, תמונות, אודיו, וידאו, ZIP · עד 200MB לקובץ · הסוג מזוהה
          אוטומטית לפי שם הקובץ (למורה / לתלמיד / מצגת / בגרות)
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-sm">
          <span className="block mb-1 font-medium">דירוג גישה</span>
          <select value={access} onChange={(e) => setAccess(e.target.value as Access)} className="input">
            <option value="free">חינם</option>
            <option value="paid">בתשלום</option>
            <option value="tier">לפי רמה</option>
            <option value="premium">פרימיום בלבד</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">סטטוס</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="input">
            <option value="active">פעיל</option>
            <option value="draft">טיוטה</option>
            <option value="suspended">מושהה</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">מחיר הורדה בודדת (₪)</span>
          <input
            type="number"
            step="0.5"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="input"
          />
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">רמת פרימיום מינימלית</span>
          <select
            value={minTier}
            onChange={(e) => setMinTier(e.target.value as Tier)}
            className="input"
          >
            {Object.entries(TIERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={premiumOnly}
            onChange={(e) => setPremiumOnly(e.target.checked)}
          />
          פרימיום בלבד
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">תיאור (לכל הקבצים)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="אופציונלי"
          />
        </label>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.key}
              className="rounded-xl border border-foreground/10 bg-white p-3 grid gap-2 sm:grid-cols-[1fr_220px_auto] items-center"
            >
              <div className="min-w-0">
                <input
                  value={it.title}
                  onChange={(e) => patch(it.key, { title: e.target.value })}
                  disabled={it.status !== "idle" && it.status !== "error"}
                  className="input py-1.5"
                  aria-label="כותרת החומר"
                />
                <div className="mt-1 text-xs text-muted flex flex-wrap gap-2">
                  <span dir="ltr" className="font-mono truncate max-w-[260px]">
                    {it.file.name}
                  </span>
                  <span>{formatBytes(it.file.size)}</span>
                  {it.status === "uploading" && <span>מעלה… {it.progress.toFixed(0)}%</span>}
                  {it.status === "saving" && <span>שומרת…</span>}
                  {it.status === "done" && (
                    <span className="text-green-700 inline-flex items-center gap-1">
                      <FileCheck2 className="h-3.5 w-3.5" /> הועלה
                    </span>
                  )}
                  {it.status === "error" && <span className="text-red-600">{it.error}</span>}
                </div>
                {(it.status === "uploading" || it.status === "saving") && (
                  <div className="mt-1 h-1.5 rounded-full bg-blue-soft overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-l from-blue to-blue-deep transition-all"
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <select
                value={it.kind}
                onChange={(e) => patch(it.key, { kind: e.target.value as MaterialKind })}
                disabled={it.status !== "idle" && it.status !== "error"}
                className="input py-1.5"
                aria-label="סוג החומר"
              >
                {Object.entries(MATERIAL_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.icon} {v.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => remove(it.key)}
                disabled={it.status === "uploading" || it.status === "saving"}
                className="p-2 rounded-lg hover:bg-red-50 text-red-700 justify-self-end"
                aria-label="הסרה מהרשימה"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={startUpload}
          disabled={busy || pendingCount === 0}
        >
          {busy ? "מעלה…" : `העלאה (${pendingCount})`}
        </button>
        {items.some((it) => it.status === "done") && (
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => setItems((prev) => prev.filter((it) => it.status !== "done"))}
          >
            ניקוי הושלמו
          </button>
        )}
      </div>
    </div>
  );
}
