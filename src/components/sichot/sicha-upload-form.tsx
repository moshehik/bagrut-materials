"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2, AlertCircle, X, PartyPopper, FilePlus2, FileText } from "lucide-react";
import { SichaNameChoice } from "./sicha-name-choice";
import { fileColor } from "@/lib/sicha-colors";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, formatBytes, stripExtension } from "@/lib/admin-utils";
import { createSicha, type CreateSichaFile } from "@/lib/actions/sichot";
import { uploadChunked } from "@/lib/sicha-upload-client";

// העלאה בחתיכות (src/lib/sicha-upload-client.ts), פתוחה לכל מורה, ותומכת בכמה קבצים בבת אחת.
type Item = { key: string; file: File };

export function SichaUploadForm({ categoryId, path }: { categoryId: number; path: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [pseudonym, setPseudonym] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [drag, setDrag] = useState(false);

  const addFiles = (files: FileList | File[]) => {
    setError(undefined);
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_UPLOAD_BYTES) {
        setError(`"${f.name}" גדול מ-200MB ולא נוסף`);
        continue;
      }
      next.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f });
    }
    if (next.length === 0) return;
    // כותרת ברירת מחדל משם הקובץ הראשון (אפשר לשנות)
    setTitle((t) => t || stripExtension(next[0].file.name));
    setItems((prev) => [...prev, ...next]);
  };

  const remove = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const submit = async () => {
    if (items.length === 0) return setError("צריך לבחור לפחות קובץ אחד");
    if (title.trim().length < 4) return setError("השיחה צריכה כותרת (לפחות 4 תווים)");
    if (description.trim().length < 10) return setError("צריך תיאור קצר של השיחה (לפחות 10 תווים)");
    if (anonymous && pseudonym.trim().length < 2) return setError("כתבי שם בדוי (לפחות 2 תווים) או בחרי להופיע בשמך");
    if (!confirmed) return setError("צריך לאשר שהשיחה מתאימה למסירה של 45 דקות לפחות");
    setBusy(true);
    setError(undefined);
    setDone(false);
    try {
      const results: CreateSichaFile[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setProgress(0);
        const uploaded = await uploadChunked(it.file, setProgress);
        results.push({
          fileUrl: uploaded.url,
          fileSig: uploaded.sig,
          fileName: it.file.name,
          mime: it.file.type || uploaded.contentType || "application/octet-stream",
          size: uploaded.size,
        });
      }
      const r = await createSicha({
        categoryId,
        title: title.trim(),
        description: description.trim(),
        seminarType: "mainstream", // העמודה חובה ב-DB; כבר לא נשאלת ולא מוצגת
        files: results,
        path,
        displayName: anonymous ? pseudonym.trim() : undefined,
      });
      if ("error" in r) throw new Error(r.error);
      setDone(true);
      setItems([]);
      setTitle("");
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
    <section className="gate-panel sicha-form sicha-form-narrow space-y-3" aria-labelledby="sicha-upload-h">
      <span className="gold-ring" aria-hidden="true" />

      <div className="flex items-center gap-3">
        <span className="gate-icon" aria-hidden>
          <CloudUpload className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h3 id="sicha-upload-h" className="text-2xl">
            להעלות שיחה חדשה
          </h3>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.88)" }}>
            העלי את השיחה הרצויה
          </p>
        </div>
      </div>

      {done && (
        <div className="flex items-start gap-2 rounded-xl bg-green-50 text-green-800 px-4 py-3 text-base animate-pop">
          <PartyPopper className="h-4 w-4 mt-1 shrink-0" />
          <span>השיחה עלתה בהצלחה!</span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-4 py-3 text-base animate-pop">
          <AlertCircle className="h-4 w-4 mt-1 shrink-0" />
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
        className="gate-card sicha-drop text-center transition-colors"
        style={{ borderStyle: "dashed", background: drag ? "#fff6d6" : undefined }}
      >
        <p className="text-lg">גררי קבצים לכאן או</p>
        <button
          type="button"
          className="btn btn-gold btn-gate mt-1 py-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          לחצי ובחרי את הקבצים
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
        <p className="mt-1 text-base gate-soft">
          ניתן להעלות כמה קבצים ביחד.
          <br />
          כל קובץ שיעלה באותה העלאה יהיה חלק מאותו שיעור.
        </p>
      </div>

      {items.length > 0 && (
        <div className="gate-card space-y-2">
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li
                key={it.key}
                className="flex items-center gap-2 rounded-xl px-3 py-1.5"
                style={{ background: fileColor(i).body, borderInlineStart: `6px solid ${fileColor(i).strip}` }}
              >
                <FileText className="h-4 w-4 shrink-0 text-[#16244e]" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-base" title={it.file.name}>
                  {it.file.name}
                </span>
                <span className="text-sm gate-soft shrink-0" dir="ltr">
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
          <button
            type="button"
            className="sicha-tag"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <FilePlus2 className="h-4 w-4" aria-hidden /> הוספת קובץ נוסף
          </button>
          <label className="block pt-1">
            <span className="text-lg">כותרת השיחה</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              maxLength={200}
              className="input mt-1 font-sans text-base"
              placeholder="כותרת השיחה"
            />
          </label>
        </div>
      )}

      <div className="gate-card space-y-3">
        <label className="block">
          <span className="text-lg">תני תיאור קצר על נושא השיעור</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            required
            aria-required="true"
            className="input mt-1 resize-y font-sans text-base"
            placeholder="על מה השיחה, למי מתאימה, מה מיוחד בה..."
            disabled={busy}
          />
        </label>

        <SichaNameChoice
          idPrefix="sicha"
          anonymous={anonymous}
          setAnonymous={setAnonymous}
          pseudonym={pseudonym}
          setPseudonym={setPseudonym}
          disabled={busy}
        />

        <label className="flex items-start gap-2 text-lg">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={busy}
            className="mt-1.5"
          />
          <span>מאשרת שהשיחה מתאימה למסירה של 45 דקות לפחות — שיעור שלם ומוכן, לא רעיון קצר.</span>
        </label>
      </div>

      {busy && (
        <div className="h-2 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full bg-[#ffd45a] transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy || items.length === 0}
          className="btn btn-gold btn-gate py-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
          {items.length > 1 ? `העלאת השיחה (${items.length} קבצים)` : "העלאת השיחה"}
        </button>
      </div>
    </section>
  );
}
