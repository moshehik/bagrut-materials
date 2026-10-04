"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2, AlertCircle, X, PartyPopper } from "lucide-react";
import type { SichaSeminar } from "@/db/schema";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, formatBytes, stripExtension } from "@/lib/admin-utils";
import { SICHA_SEMINARS } from "@/lib/constants";
import { createSichaBatch, type CreateSichaItem } from "@/lib/actions/sichot";

// אותה טכניקת העלאה בחתיכות כמו src/components/admin/upload-form.tsx (Blob בוטל,
// עוברים דרך /api/sichot/upload/chunk+finish → דרייב), פתוחה לכל מורה, וכן תומכת
// בהעלאת כמה קבצים בבת אחת (מכפיל את קצב ההתחייבות — ר' src/lib/actions/sichot.ts).
const CHUNK_BYTES = 4 * 1024 * 1024;

async function postChunk(session: string, index: number, chunk: ArrayBuffer): Promise<void> {
  const res = await fetch(`/api/sichot/upload/chunk?session=${session}&index=${index}`, {
    method: "POST",
    body: chunk,
    headers: { "content-type": "application/octet-stream" },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `שגיאה ${res.status}`);
}

async function uploadChunked(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ url: string; contentType?: string; size: number }> {
  const buf = await file.arrayBuffer();
  const session = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(36).padStart(2, "0"),
  )
    .join("")
    .slice(0, 24);
  const totalParts = Math.max(1, Math.ceil(buf.byteLength / CHUNK_BYTES));
  for (let i = 0, n = 0; i < buf.byteLength; i += CHUNK_BYTES, n++) {
    await postChunk(session, n, buf.slice(i, Math.min(i + CHUNK_BYTES, buf.byteLength)));
    onProgress(Math.round(((n + 1) / totalParts) * 100));
  }
  const res = await fetch("/api/sichot/upload/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: buf.byteLength,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `איחוד הקובץ נכשל (${res.status})`);
  return { url: j.url as string, contentType: j.contentType as string | undefined, size: buf.byteLength };
}

type Item = { key: string; file: File; title: string };

export function SichaUploadForm({ categoryId, path }: { categoryId: number; path: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [description, setDescription] = useState("");
  const [seminarType, setSeminarType] = useState<SichaSeminar>("mainstream");
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<{ count: number; weeks: number } | null>(null);
  const [drag, setDrag] = useState(false);

  const addFiles = (files: FileList | File[]) => {
    setError(undefined);
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_UPLOAD_BYTES) {
        setError(`"${f.name}" גדול מ-200MB ולא נוסף`);
        continue;
      }
      next.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, title: stripExtension(f.name) });
    }
    setItems((prev) => [...prev, ...next]);
  };

  const patchTitle = (key: string, title: string) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, title } : it)));
  const remove = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const submit = async () => {
    if (items.length === 0) return setError("צריך לבחור לפחות קובץ אחד");
    if (items.some((it) => it.title.trim().length < 4)) return setError("כל שיחה צריכה כותרת (לפחות 4 תווים)");
    if (!confirmed) return setError("צריך לאשר שכל שיחה מתאימה למסירה של 45 דקות לפחות");
    setBusy(true);
    setError(undefined);
    setDone(null);
    try {
      const results: CreateSichaItem[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setProgress(0);
        const uploaded = await uploadChunked(it.file, setProgress);
        results.push({
          categoryId,
          title: it.title.trim(),
          description: description.trim() || undefined,
          seminarType,
          fileUrl: uploaded.url,
          fileName: it.file.name,
          mime: it.file.type || uploaded.contentType || "application/octet-stream",
          size: uploaded.size,
        });
      }
      const r = await createSichaBatch({ items: results, path });
      if ("error" in r) throw new Error(r.error);
      setDone({ count: r.ids.length, weeks: r.cadenceWeeks });
      setItems([]);
      setDescription("");
      setConfirmed(false);
      setProgress(0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בהעלאה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="font-bold text-lg">להעלות שיחה חדשה</h3>
        <p className="text-sm text-muted mt-0.5">
          הקבצים עולים מיד לכל המורות. אפשר להעלות כמה שיחות בבת אחת — קצב ההתחייבות שלך
          מוכפל לפי כמה שיחות מעלים יחד (למשל 2 שיחות בבת אחת = פטור כפול מהרגיל).
        </p>
      </div>

      {done && (
        <div className="flex items-start gap-2 rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm animate-pop">
          <PartyPopper className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {done.count > 1 ? `${done.count} שיחות עלו בהצלחה!` : "השיחה עלתה בהצלחה!"} יש לך אישור
            להעלאה הבאה בעוד {done.weeks} שבועות.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-4 py-3 text-sm animate-pop">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

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
        <button type="button" className="btn btn-oak mt-2" onClick={() => inputRef.current?.click()} disabled={busy}>
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
        <p className="mt-2 text-xs text-muted">אפשר לבחור כמה קבצים יחד — כל קובץ הוא שיחה נפרדת</p>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className="rounded-xl border border-foreground/10 bg-white p-3 flex items-center gap-2">
              <input
                value={it.title}
                onChange={(e) => patchTitle(it.key, e.target.value)}
                disabled={busy}
                className="input py-1.5 flex-1"
                placeholder="כותרת השיחה"
                aria-label="כותרת השיחה"
              />
              <span className="text-xs text-muted shrink-0" dir="ltr">
                {formatBytes(it.file.size)}
              </span>
              <button
                type="button"
                onClick={() => remove(it.key)}
                disabled={busy}
                className="p-1.5 rounded-lg hover:bg-red-50 text-red-700 shrink-0"
                aria-label="הסרה"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="block">
        <span className="text-sm font-semibold">תיאור קצר (רשות, לכל השיחות שנבחרו)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          className="input mt-1 resize-y"
          placeholder="על מה השיחה, למי מתאימה, מה מיוחד בה..."
          disabled={busy}
        />
      </label>

      <label className="block max-w-xs">
        <span className="text-sm font-semibold">סוג הסמינר שבו נמסרה</span>
        <select
          value={seminarType}
          onChange={(e) => setSeminarType(e.target.value as SichaSeminar)}
          className="input mt-1"
          disabled={busy}
        >
          {Object.entries(SICHA_SEMINARS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={busy}
          className="mt-0.5"
        />
        <span>מאשרת שכל שיחה שנבחרה מתאימה למסירה של 45 דקות לפחות — שיעור שלם ומוכן, לא רעיון קצר.</span>
      </label>

      {busy && (
        <div className="h-1.5 rounded-full bg-blue-soft overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-blue to-blue-deep transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={busy || items.length === 0} className="btn btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
          {items.length > 1 ? `העלאת ${items.length} שיחות` : "העלאת השיחה"}
        </button>
      </div>
    </div>
  );
}
