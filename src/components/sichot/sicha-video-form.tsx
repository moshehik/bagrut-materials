"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Loader2, AlertCircle, PartyPopper, CircleHelp, X, FileVideo } from "lucide-react";
import { SichaNameChoice } from "./sicha-name-choice";
import { addSichaVideo } from "@/lib/actions/sichot-videos";
import { formatBytes, stripExtension } from "@/lib/admin-utils";

// העלאת סרטון בגרירה/בחירה: חתיכות של 4MB דרך הדומיין שלנו (נטפרי חוסם דיבור ישיר עם גוגל), בלי תקרת גודל
// (תקרת בטיחות של 10GB בשרת). לחלופין – הדבקת קישור שיתוף מהדרייב (האתר מעתיק בצד של גוגל).
const CHUNK = 4 * 1024 * 1024;
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|mpg|mpeg|3gp)$/i;

type Init = { uploadUrl: string; sig: string; error?: string };
type ChunkRes = { ok?: boolean; done?: boolean; fileId?: string; fileSig?: string; error?: string };

async function uploadVideo(
  file: File,
  categoryId: number,
  onProgress: (pct: number) => void,
): Promise<{ fileId: string; sig: string; size: number }> {
  const initRes = await fetch("/api/sichot/video-upload/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size, categoryId }),
  });
  const init = (await initRes.json().catch(() => ({}))) as Init;
  if (!initRes.ok) throw new Error(init.error || `שגיאה ${initRes.status}`);

  for (let start = 0; start < file.size; start += CHUNK) {
    const end = Math.min(start + CHUNK, file.size);
    const body = await file.slice(start, end).arrayBuffer();
    let last: ChunkRes = {};
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch("/api/sichot/video-upload/chunk", {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            "x-upload-url": init.uploadUrl,
            "x-upload-sig": init.sig,
            "x-range-start": String(start),
            "x-total": String(file.size),
          },
          body,
        });
        last = (await res.json().catch(() => ({}))) as ChunkRes;
        if (res.ok) break;
        if (attempt === 3) throw new Error(last.error || `שגיאה ${res.status}`);
      } catch (e) {
        if (attempt === 3) throw e;
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
    onProgress(Math.round((end / file.size) * 100));
    if (end === file.size) {
      if (!last.done || !last.fileId || !last.fileSig) throw new Error("ההעלאה לא הסתיימה כראוי, נסי שוב");
      return { fileId: last.fileId, sig: last.fileSig, size: file.size };
    }
  }
  throw new Error("קובץ ריק");
}

export function SichaVideoForm({
  categoryId,
  path,
}: {
  categoryId: number;
  path: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [pseudonym, setPseudonym] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/") && !VIDEO_EXT.test(f.name)) return setError("זה לא נראה כמו קובץ סרטון");
    setError(undefined);
    setFile(f);
    setTitle((t) => t || stripExtension(f.name));
  };

  const submit = async () => {
    setError(undefined);
    setDone(false);
    if (!file && !link.trim()) return setError("גררי קובץ סרטון, או הדביקי קישור מהדרייב");
    if (title.trim().length < 4) return setError("כל סרטון צריך כותרת (לפחות 4 תווים)");
    if (description.trim().length < 10) return setError("צריך תיאור קצר של הסרטון (לפחות 10 תווים)");
    if (anonymous && pseudonym.trim().length < 2) return setError("כתבי שם בדוי (לפחות 2 תווים) או בחרי להופיע בשמך");
    setBusy(true);
    setProgress(0);
    try {
      const uploaded = file ? await uploadVideo(file, categoryId, setProgress) : null;
      const r = await addSichaVideo({
        categoryId,
        title,
        description,
        ...(uploaded
          ? { uploadedFileId: uploaded.fileId, uploadedSig: uploaded.sig, uploadedSize: uploaded.size }
          : { link }),
        displayName: anonymous ? pseudonym.trim() : undefined,
        path,
      });
      if ("error" in r) throw new Error(r.error);
      setDone(true);
      setFile(null);
      setTitle("");
      setLink("");
      setDescription("");
      setProgress(0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gate-panel sicha-form sicha-form-narrow sicha-video-form space-y-3" aria-labelledby="sicha-video-form-h">
      <span className="gold-ring" aria-hidden="true" />

      <div className="flex items-center gap-3">
        <span className="gate-icon" aria-hidden>
          <Video className="h-6 w-6" />
        </span>
        <h3 id="sicha-video-form-h" className="text-2xl">
          לשתף סרטון לשיעור
        </h3>
      </div>

      {done && (
        <div className="flex items-start gap-2 rounded-xl bg-green-50 text-green-800 px-4 py-3 text-base animate-pop">
          <PartyPopper className="h-4 w-4 mt-1 shrink-0" />
          <span>הסרטון נוסף בהצלחה!</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-4 py-3 text-base animate-pop">
          <AlertCircle className="h-4 w-4 mt-1 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="gate-card space-y-3">
        {/* גרירה / בחירת קובץ – כמו בהעלאת שיחות */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className="sicha-drop text-center transition-colors rounded-xl p-3"
          style={{ border: "2px dashed #0a0a0a", background: drag ? "#fff6d6" : "rgba(255,255,255,0.55)" }}
        >
          {file ? (
            <div className="flex items-center gap-2 text-start">
              <FileVideo className="h-5 w-5 shrink-0 text-[#16244e]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-base" title={file.name}>
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
                aria-label="הסרה"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-lg">גררי קובץ סרטון לכאן או</p>
              <button type="button" className="btn btn-gold btn-gate mt-1 py-1.5" onClick={() => inputRef.current?.click()} disabled={busy}>
                לחצי ובחרי את הקובץ
              </button>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="video/*,.mkv,.mov,.m4v"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <label className="block">
          <span className="text-lg inline-flex items-center gap-1.5">
            או קישור מהדרייב
            <span
              tabIndex={0}
              role="img"
              aria-label="איך מעתיקים קישור"
              data-tip={
                'איך מעתיקים קישור?\nבדרייב: לחיצה ימנית על הסרטון ← שיתוף\nבוחרים "כל מי שיש לו את הקישור"\nואז "העתקת קישור" ומדביקים כאן.'
              }
              className="inline-flex cursor-help"
            >
              <CircleHelp className="h-5 w-5" aria-hidden />
            </span>
          </span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            maxLength={500}
            disabled={busy || !!file}
            dir="ltr"
            inputMode="url"
            className="input mt-1 font-sans text-base"
            placeholder="https://drive.google.com/file/d/..."
          />
        </label>

        <label className="block">
          <span className="text-lg">כותרת הסרטון</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            disabled={busy}
            className="input mt-1 font-sans text-base"
            placeholder="למשל: סרטון קצר על חג הסוכות"
          />
        </label>

        <label className="block">
          <span className="text-lg">תיאור קצר (חובה)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            required
            aria-required="true"
            disabled={busy}
            className="input mt-1 resize-y font-sans text-base"
            placeholder="מה רואים בסרטון, כמה זמן, למי מתאים..."
          />
        </label>

        <SichaNameChoice
          idPrefix="video"
          anonymous={anonymous}
          setAnonymous={setAnonymous}
          pseudonym={pseudonym}
          setPseudonym={setPseudonym}
          disabled={busy}
        />
      </div>

      {busy && file && (
        <div className="h-2 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full bg-[#ffd45a] transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={busy} className="btn btn-gold btn-gate py-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          {busy ? (file ? `מעלה… ${progress}%` : "מעתיקה את הסרטון… (עד דקה)") : "הוספת הסרטון"}
        </button>
      </div>
    </section>
  );
}
