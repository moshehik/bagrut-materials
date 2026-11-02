"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Loader2, AlertCircle, PartyPopper, CircleHelp } from "lucide-react";
import { SichaNameChoice } from "./sicha-name-choice";
import { addSichaVideo } from "@/lib/actions/sichot-videos";

export function SichaVideoForm({
  categoryId,
  path,
}: {
  categoryId: number;
  path: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [pseudonym, setPseudonym] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(undefined);
    setDone(false);
    if (title.trim().length < 4) return setError("כל סרטון צריך כותרת (לפחות 4 תווים)");
    if (!link.trim()) return setError("הדביקי קישור שיתוף מהדרייב");
    if (description.trim().length < 10) return setError("צריך תיאור קצר של הסרטון (לפחות 10 תווים)");
    if (anonymous && pseudonym.trim().length < 2) return setError("כתבי שם בדוי (לפחות 2 תווים) או בחרי להופיע בשמך");
    setBusy(true);
    try {
      const r = await addSichaVideo({
        categoryId,
        title,
        description,
        link,
        displayName: anonymous ? pseudonym.trim() : undefined,
        path,
      });
      if ("error" in r) throw new Error(r.error);
      setDone(true);
      setTitle("");
      setLink("");
      setDescription("");
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
        <div className="min-w-0">
          <h3 id="sicha-video-form-h" className="text-2xl">
            לשתף סרטון לשיעור
          </h3>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.88)" }}>
            מדביקים קישור שיתוף מהדרייב שלך, והאתר מעתיק את הסרטון לדרייב שלו ויוצר קישור חדש.
          </p>
        </div>
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
          <span className="text-lg inline-flex items-center gap-1.5">
            קישור מהדרייב
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
            disabled={busy}
            dir="ltr"
            inputMode="url"
            className="input mt-1 font-sans text-base"
            placeholder="https://drive.google.com/file/d/..."
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

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={busy} className="btn btn-gold btn-gate py-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          {busy ? "מעתיקה את הסרטון… (עד דקה)" : "הוספת הסרטון"}
        </button>
      </div>
    </section>
  );
}
