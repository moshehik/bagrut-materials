"use client";

import { useActionState, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Loader2 } from "lucide-react";
import { chooseYearlySubjectsAction } from "@/lib/actions/subscription-subjects";
import { SUBJECT_HOUSES, YEARLY_INCLUDED_SUBJECTS } from "@/lib/constants";
import type { CheckoutSubject } from "@/components/checkout-form";

/** בחירת מקצוע אחד עד 3 מקצועות במנוי שנתי שנרכש עם "דלג" – אותו עיצוב של עמוד הרכישה */
export function PendingSubjectsForm({
  purchaseId,
  subjects,
}: {
  purchaseId: number;
  subjects: CheckoutSubject[];
}) {
  const [state, action, pending] = useActionState(chooseYearlySubjectsAction, undefined);
  const [selected, setSelected] = useState<number[]>([]);
  const ready = selected.length >= 1 && selected.length <= YEARLY_INCLUDED_SUBJECTS;

  function toggle(id: number) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= YEARLY_INCLUDED_SUBJECTS) return cur;
      return [...cur, id];
    });
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="categoryIds" value={id} />
      ))}
      {state?.error && (
        <div role="alert" className="gate-strip gate-strip-alert">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="flex-1">{state.error}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-3xl">בחרי עד {YEARLY_INCLUDED_SUBJECTS} מקצועות</h3>
        <span className="gate-badge" aria-live="polite">
          נבחרו {selected.length} מתוך {YEARLY_INCLUDED_SUBJECTS}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {subjects.map((s) => {
          const on = selected.includes(s.id);
          const disabled = !on && selected.length >= YEARLY_INCLUDED_SUBJECTS;
          return (
            <label
              key={s.id}
              className={`gate-card gate-pick ${on ? "gate-pick-on" : ""} ${disabled ? "gate-pick-off" : ""}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(s.id)}
              />
              <span className="gate-check" aria-hidden>
                {on && <Check className="h-5 w-5" strokeWidth={3} />}
              </span>
              {s.slug && SUBJECT_HOUSES[s.slug] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="gate-pick-house" src={SUBJECT_HOUSES[s.slug]} alt="" width={356} height={266} />
              ) : (
                <span className="text-2xl leading-none" aria-hidden>{s.icon}</span>
              )}
              <span className="text-xl">{s.title}</span>
            </label>
          );
        })}
      </div>
      <div className="text-center">
        <button type="submit" disabled={pending || !ready} className="btn btn-gold btn-gate py-2 disabled:opacity-50">
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          אישור המקצועות <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
        </button>
        <p className="mt-2 text-[#ffd45a]">
          המחיר זהה למקצוע אחד ול-{YEARLY_INCLUDED_SUBJECTS} מקצועות. אפשר להוסיף מקצוע גם בהמשך השנה, וכל עוד לא
          בוצעה הורדה במקצוע – אפשר להחליף אותו.
        </p>
      </div>
    </form>
  );
}
