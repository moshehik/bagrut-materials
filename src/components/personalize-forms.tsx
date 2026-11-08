"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { setFillLinePercentAction } from "@/lib/actions/preferences";
import { FILL_LINE_PERCENT_DEFAULT, fillLinePercentOptions } from "@/lib/fill-line-pref";

/* טפסי ההתאמה האישית – בתוך חלונית כחולה כהה (.gate-panel): צ'יפים בזהב בהיר, לחצני זהב, הודעות כמו בשאר האזור האישי */

/** אורך הקו בדוגמה בהגדרת ברירת המחדל (בתווים) – הדוגמה מציגה את אותו יחס שיחול בקובץ */
const SAMPLE_BASE_UNDERSCORES = 20;

function FillLinePreview({ percent }: { percent: number }) {
  const n = Math.max(3, Math.round((SAMPLE_BASE_UNDERSCORES * percent) / 100));
  return (
    <div className="gate-card !block" aria-live="polite">
      <p className="text-base opacity-70">כך ייראה קו מילוי בקובץ שתורידי:</p>
      <p className="mt-2 break-all text-2xl leading-loose" dir="rtl">
        תשובה: <span aria-hidden>{"_".repeat(n)}</span>
        <span className="sr-only">קו מילוי באורך {percent} אחוז</span>
      </p>
    </div>
  );
}

export function FillLineForm({ initialPercent }: { initialPercent: number }) {
  const [saved, setSaved] = useState(initialPercent);
  const [choice, setChoice] = useState(initialPercent);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = choice !== saved;

  const save = (value: number) => {
    setMsg(null);
    start(async () => {
      const r = await setFillLinePercentAction(value);
      if (r.ok && typeof r.fillLinePercent === "number") {
        setSaved(r.fillLinePercent);
        setChoice(r.fillLinePercent);
        setMsg({
          ok: true,
          text:
            r.fillLinePercent === FILL_LINE_PERCENT_DEFAULT
              ? "חזרנו לברירת המחדל. הקבצים יורדים כמו שנבנו."
              : "ההגדרה נשמרה. כל קובץ שתורידי מעכשיו יופיע עם קווי מילוי באורך שבחרת.",
        });
      } else {
        setMsg({ ok: false, text: r.error ?? "לא ניתן לשמור כרגע, נסי שוב בעוד רגע" });
      }
    });
  };

  return (
    <div className="space-y-5">
      <p className="gate-soft text-lg leading-snug">
        בחרי כמה ארוכים יהיו קווי המילוי (____) בדפים שתורידי ותראי באתר. 100% הוא האורך המקורי של הקובץ.
      </p>

      <div role="radiogroup" aria-label="יחס אורך קווי המילוי" className="acc-chips">
        {fillLinePercentOptions().map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={choice === p}
            onClick={() => {
              setChoice(p);
              setMsg(null);
            }}
            className={`acc-chip${choice === p ? " acc-chip-on" : ""}`}
          >
            {p === FILL_LINE_PERCENT_DEFAULT ? "100% – כרגיל" : `${p}%`}
          </button>
        ))}
      </div>

      <FillLinePreview percent={choice} />

      {msg && (
        <div
          role={msg.ok ? "status" : "alert"}
          className={`gate-strip animate-pop !py-2 text-base ${msg.ok ? "!justify-start" : "gate-strip-alert"}`}
        >
          {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="flex-1">{msg.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" disabled={pending || !dirty} onClick={() => save(choice)} className="btn btn-gold btn-gate py-1.5 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} שמירת ההגדרה
        </button>
        {saved !== FILL_LINE_PERCENT_DEFAULT && (
          <button type="button" disabled={pending} onClick={() => save(FILL_LINE_PERCENT_DEFAULT)} className="btn btn-gate gate-skip py-1.5 disabled:opacity-50">
            <RotateCcw className="h-4 w-4" aria-hidden /> חזרה לברירת המחדל
          </button>
        )}
      </div>
    </div>
  );
}
