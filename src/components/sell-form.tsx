"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { createSellOffer } from "@/lib/actions/sell";

export function SellForm({ subjects }: { subjects: string[] }) {
  const [state, action, pending] = useActionState(createSellOffer, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      {state?.error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#8a1c4f] px-4 py-3 text-sm animate-pop">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state?.ok && (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-emerald-50 text-emerald-900 px-4 py-3 text-sm animate-pop">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>ההצעה נשלחה! מנהלת האתר תעבור עליה ותחזור אלייך במייל.</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">מקצוע</span>
          <input
            name="subject"
            list="sell-subjects"
            required
            minLength={2}
            className="input mt-1"
            placeholder="למשל: תורה, נביא, לשון..."
          />
          <datalist id="sell-subjects">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">מחיר מבוקש (₪, לא חובה)</span>
          <input
            name="askingPrice"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className="input mt-1"
            placeholder="למשל: 150"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-semibold">שם החומר</span>
        <input
          name="title"
          required
          minLength={3}
          maxLength={200}
          className="input mt-1"
          placeholder="למשל: מערך שיעור מלא – ספר שמות פרק א'"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">תיאור</span>
        <textarea
          name="description"
          required
          minLength={10}
          rows={5}
          className="input mt-1 resize-y"
          placeholder="מה כלול (דפי שכפול, מצגת, פתרונות...), לאיזה שאלון / יחידות, כמה עמודים, האם נוסה בכיתה"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">קישור לקובץ לדוגמה (לא חובה)</span>
        <input
          name="fileUrl"
          type="url"
          dir="ltr"
          className="input mt-1 text-left"
          placeholder="https://drive.google.com/..."
        />
        <span className="text-xs text-muted">קישור ל-Google Drive / Dropbox וכדומה, לצפייה בלבד</span>
      </label>
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn btn-oak">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          שלחי הצעה
        </button>
      </div>
    </form>
  );
}
