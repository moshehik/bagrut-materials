"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, CloudUpload, FileText, Loader2, Plus, X } from "lucide-react";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/admin-utils";
import { addSichaFile } from "@/lib/actions/sichot";
import { uploadChunked } from "@/lib/sicha-upload-client";

/**
 * כפתור "+" בפינת תיבת "הוספת רעיון": פותח חלונית קטנה להוספת קובץ חדש לשיעור
 * (גרירה לחלונית או בחירה מהמחשב). הקובץ מצטרף לשאר קבצי השיעור, ככרטיס קובץ משלו.
 */
export function AddFileButton({ sichaId, path }: { sichaId: number; path: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sicha-plus"
        aria-label="הוספת קובץ חדש לשיעור"
        aria-haspopup="dialog"
        data-tip={"רוצה להוסיף גם קובץ?\nלחיצה כאן פותחת חלון\nלהעלאת קובץ חדש לשיעור"}
      >
        <Plus className="h-6 w-6" strokeWidth={3} aria-hidden />
      </button>
      {open && <AddFileDialog sichaId={sichaId} path={path} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddFileDialog({ sichaId, path, onClose }: { sichaId: number; path: string; onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, onClose]);

  const pick = (files: FileList | File[] | null | undefined) => {
    const f = files && Array.from(files)[0];
    if (!f) return;
    setError(undefined);
    if (f.size > MAX_UPLOAD_BYTES) return setError(`"${f.name}" גדול מ-200MB ולא נוסף`);
    setFile(f);
  };

  const submit = async () => {
    if (!file) return setError("צריך לבחור קובץ");
    setBusy(true);
    setError(undefined);
    setProgress(0);
    try {
      const up = await uploadChunked(file, setProgress);
      const r = await addSichaFile({
        sichaId,
        path,
        file: {
          fileUrl: up.url,
          fileSig: up.sig,
          fileName: file.name,
          mime: file.type || up.contentType || "application/octet-stream",
          size: up.size,
        },
      });
      if ("error" in r) throw new Error(r.error);
      setDone(true);
      router.refresh();
      setTimeout(onClose, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בהעלאה");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="explain-backdrop" onClick={() => !busy && onClose()}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="addfile-title"
        className="gate-panel explain-panel addfile-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="gold-ring" aria-hidden="true" />
        <button type="button" onClick={onClose} disabled={busy} className="explain-close" aria-label="סגירה">
          <X className="h-5 w-5" aria-hidden />
        </button>

        <header className="explain-header">
          <span className="gate-icon">
            <CloudUpload className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <h3 id="addfile-title" className="explain-title">
              הוספת קובץ לשיעור
            </h3>
            <p className="explain-subtitle">הקובץ יצטרף לשאר קבצי השיעור</p>
          </div>
        </header>

        {done ? (
          <div className="addfile-done" role="status">
            <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
            <span>הקובץ נוסף לשיעור!</span>
          </div>
        ) : (
          <>
            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-3 py-2 text-base animate-pop">
                <AlertCircle className="h-4 w-4 mt-1 shrink-0" aria-hidden />
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
                if (!busy) pick(e.dataTransfer.files);
              }}
              className="gate-card sicha-drop addfile-drop text-center"
              style={{ borderStyle: "dashed", background: drag ? "#fff6d6" : undefined }}
            >
              {file ? (
                <div className="flex items-center gap-2 text-start">
                  <FileText className="h-5 w-5 shrink-0 text-[#16244e]" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-lg" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-sm gate-soft shrink-0" dir="ltr">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    disabled={busy}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-700 shrink-0"
                    aria-label="הסרת הקובץ"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <>
                  <CloudUpload className="mx-auto h-8 w-8 text-[#16244e]" aria-hidden />
                  <p className="text-lg">גררי את הקובץ לכאן או</p>
                  <button type="button" className="btn btn-gold btn-gate mt-1 py-1.5" onClick={() => inputRef.current?.click()}>
                    בחרי קובץ מהמחשב
                  </button>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={ALLOWED_UPLOAD_TYPES.join(",")}
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {busy && (
              <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden" role="progressbar" aria-valuenow={progress}>
                <div className="h-full bg-[#ffd45a] transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={onClose} disabled={busy} className="addfile-cancel">
                ביטול
              </button>
              <button type="button" onClick={submit} disabled={busy || !file} className="btn btn-gold btn-gate py-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CloudUpload className="h-4 w-4" aria-hidden />}
                הוספה לשיעור
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
