"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2, Save } from "lucide-react";
import { setFillLinePercentAction } from "@/lib/actions/preferences";
import { FILL_LINE_PERCENT_DEFAULT } from "@/lib/fill-line-pref";

/* טפסי ההתאמה האישית – בתוך חלונית כחולה כהה (.gate-panel): צ'יפים בזהב בהיר, לחצני זהב, הודעות כמו בשאר האזור האישי */

/**
 * קו מילוי רגיל = פי שניים מאורך הטקסט שמוקלד בו. בחירה בשני שלבים כדי שלא יהיו המון אפשרויות על המסך:
 * קודם כיוון (קצר יותר / כרגיל / ארוך יותר), ורק אם נבחר כיוון – כמה (30% או 50%).
 */
type Dir = "shorter" | "normal" | "longer";
const DIRS: { dir: Dir; label: string }[] = [
  { dir: "shorter", label: "קצר יותר" },
  { dir: "normal", label: "כרגיל" },
  { dir: "longer", label: "ארוך יותר" },
];
const AMOUNTS: Record<Exclude<Dir, "normal">, { pct: number; label: string }[]> = {
  shorter: [
    { pct: 70, label: "קטן ב-30%" },
    { pct: 50, label: "קטן ב-50%" },
  ],
  longer: [
    { pct: 130, label: "גדול ב-30%" },
    { pct: 150, label: "גדול ב-50%" },
  ],
};
const SAMPLE_BASE_UNDERSCORES = 12;

const dirOf = (p: number): Dir => (p < FILL_LINE_PERCENT_DEFAULT ? "shorter" : p > FILL_LINE_PERCENT_DEFAULT ? "longer" : "normal");

/** ערך שנשמר בעבר ואינו אחד מהערכים המוצעים (למשל 140) מוצג כקרוב ביותר באותו כיוון */
const nearestOption = (p: number): number => {
  const d = dirOf(p);
  if (d === "normal") return FILL_LINE_PERCENT_DEFAULT;
  return AMOUNTS[d].reduce((best, o) => (Math.abs(o.pct - p) < Math.abs(best.pct - p) ? o : best)).pct;
};

const savedText = (percent: number) =>
  "ההגדרה נשמרה. כל קובץ שתורידי מעכשיו יופיע עם קווי מילוי באורך שבחרת.";

/** demo: הדגמה לסיור באתר (/tour-demo/personalize) – בלי שמירה אמיתית ובלי התחברות */
export function FillLineForm({ initialPercent, demo }: { initialPercent: number; demo?: boolean }) {
  const [saved, setSaved] = useState(nearestOption(initialPercent));
  const [choice, setChoice] = useState(nearestOption(initialPercent));
  // הכיוון בנפרד מהבחירה: אחרי לחיצה על "ארוך יותר" שום אחוז לא נבחר מעצמו – האפשרויות נצבעות רק בעמידה עליהן או בבחירה
  const [dir, setDir] = useState<Dir>(dirOf(nearestOption(initialPercent)));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = choice !== saved;

  const save = (value: number) => {
    setMsg(null);
    if (demo) {
      // הדגמה: רק על המסך – לא שומרים ולא פונים לשרת, אבל מראים את אותה תגובה כמו בשמירה אמיתית
      setSaved(value);
      setChoice(value);
      setDir(dirOf(value));
      setMsg({ ok: true, text: savedText(value) });
      return;
    }
    start(async () => {
      const r = await setFillLinePercentAction(value);
      if (r.ok && typeof r.fillLinePercent === "number") {
        setSaved(nearestOption(r.fillLinePercent));
        setChoice(nearestOption(r.fillLinePercent));
        setDir(dirOf(nearestOption(r.fillLinePercent)));
        setMsg({ ok: true, text: savedText(r.fillLinePercent) });
      } else {
        setMsg({ ok: false, text: r.error ?? "לא ניתן לשמור כרגע, נסי שוב בעוד רגע" });
      }
    });
  };

  return (
    <div className="space-y-5">
      <p className="gate-soft text-lg leading-snug" style={{ fontFamily: "var(--font-hand)" }}>
        בדפי העבודה יש קווים ריקים (____) שבהם כותבים תשובה.
        <br />
        באופן רגיל הקו ארוך פי שניים מהטקסט שמוקלד בו.
        <br />
        רוצה קו קצר יותר או ארוך יותר? לחצי ובחרי כמה.
      </p>

      <div className="fl-board">
      <div role="radiogroup" aria-label="אורך קווי המילוי" className="fl-chips">
        {DIRS.map(({ dir: d, label }) => (
          <button
            key={d}
            type="button"
            role="radio"
            data-dir={d}
            aria-checked={dir === d}
            onClick={() => {
              setDir(d);
              // "כרגיל" נבחר מיד; בשאר הכיוונים לא נבחר אחוז עד שלוחצים עליו (נשאר הערך השמור)
              setChoice(d === "normal" ? FILL_LINE_PERCENT_DEFAULT : AMOUNTS[d].some((o) => o.pct === choice) ? choice : saved);
              setMsg(null);
            }}
            className={`fl-chip${dir === d ? " fl-chip-on" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {dir !== "normal" && (
        <div role="radiogroup" aria-label={dir === "longer" ? "כמה ארוך יותר" : "כמה קצר יותר"} className="fl-opts animate-pop">
          <div className="fl-opt fl-opt-ref" aria-label="להשוואה: האורך הרגיל">
            <span className="fl-opt-dot" aria-hidden />
            <span className="fl-opt-name">כרגיל (להשוואה)</span>
            <span className="fl-opt-line" dir="rtl" aria-hidden>
              {"_".repeat(SAMPLE_BASE_UNDERSCORES)}
            </span>
          </div>
          {AMOUNTS[dir].map(({ pct, label }) => (
            <button
              key={pct}
              type="button"
              role="radio"
              data-pct={pct}
              aria-checked={choice === pct}
              onClick={() => {
                setChoice(pct);
                setMsg(null);
              }}
              className={`fl-opt${choice === pct ? " fl-opt-on" : ""}`}
            >
              <span className="fl-opt-dot" aria-hidden>
                {choice === pct && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="fl-opt-name">{label}</span>
              <span className="fl-opt-line" dir="rtl" aria-hidden>
                {"_".repeat(Math.round((SAMPLE_BASE_UNDERSCORES * pct) / 100))}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button type="button" data-pref-save disabled={pending || !dirty} onClick={() => save(choice)} className={`fl-save${dirty ? " fl-save-ready" : ""}`}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} שמירה
        </button>
      </div>
      </div>

      {msg && (
        <div
          role={msg.ok ? "status" : "alert"}
          className={`gate-strip animate-pop !py-2 text-base ${msg.ok ? "!justify-start" : "gate-strip-alert"}`}
        >
          {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="flex-1">{msg.text}</span>
        </div>
      )}

    </div>
  );
}
