"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Lock, AlertCircle, CreditCard } from "lucide-react";
import { GateShekel } from "@/components/gate-shekel";
import { LocationFields } from "@/components/auth-forms";
import { purchaseAction } from "@/lib/actions/purchase";
import { formatPrice, YEARLY_INCLUDED_SUBJECTS, SUBJECT_HOUSES } from "@/lib/constants";

export type CheckoutSubject = { id: number; title: string; icon: string; slug?: string };

export type CheckoutFormProps = {
  kind: "single" | "bundle" | "plan";
  /** מסלולי המנוי שנמכרים כיום (המסלולים החודשיים הישנים הוסרו – ר' RETIRED_PLANS) */
  plan?: "yearly" | "substitute_3m" | "substitute_daily";
  materialId?: number;
  categoryId?: number;
  /** רשימת מקצועות ראשיים לבחירה (למנוי שנתי / ממלאת מקום 3 חודשים) */
  subjects?: CheckoutSubject[];
  /** מקצועות שנבחרו מראש */
  preselected?: number[];
  basePrice: number;
  /** עיצוב "שער" (כמו עמוד המסלולים והמחירים) – למסלולי מנוי */
  gate?: boolean;
  /** רכישה ראשונה: חסרים עיר מגורים ושם תיכון – מבקשים אותם בטופס */
  needsLocation?: boolean;
};

export function CheckoutForm(props: CheckoutFormProps) {
  const {
    kind,
    plan,
    materialId,
    categoryId,
    subjects = [],
    preselected = [],
    basePrice,
    gate = false,
    needsLocation = false,
  } = props;

  const [state, action, pending] = useActionState(purchaseAction, undefined);
  const [selected, setSelected] = useState<number[]>(preselected.slice(0, 3));

  const needsMulti = kind === "plan" && (plan === "yearly" || plan === "substitute_3m");
  /** מנוי שנתי / ממלאת מקום 3 חודשים = מקצוע אחד, ואפשר להרחיב עד 3 באותו מחיר */
  const isYearly = plan === "yearly" || plan === "substitute_3m";
  const minPick = 1;
  const maxPick = YEARLY_INCLUDED_SUBJECTS;

  const total = basePrice;

  const canSubmit = useMemo(() => {
    if (needsMulti && (selected.length < minPick || selected.length > maxPick)) return false;
    return true;
  }, [needsMulti, minPick, maxPick, selected]);

  function toggle(id: number) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= maxPick) return cur;
      return [...cur, id];
    });
  }

  if (gate) {
    const arrow = <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />;
    return (
      <form action={action} className="mt-8 space-y-8">
        <input type="hidden" name="kind" value={kind} />
        {plan && <input type="hidden" name="plan" value={plan} />}
        {needsMulti && selected.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}

        {state?.error && (
          <div role="alert" className="gate-strip gate-strip-alert animate-pop">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            <span className="flex-1">{state.error}</span>
          </div>
        )}

        {needsMulti && (
          <section aria-labelledby="pick-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="pick-h" className="text-3xl">בחרי מקצוע</h3>
              {selected.length > 0 && (
                <span className="gate-badge" aria-live="polite">
                  {selected.length === 1
                    ? "נבחר מקצוע"
                    : `מקצוע + ${selected.length - 1} נוספים – כלולים במחיר`}
                </span>
              )}
            </div>
            <p className="mt-1 text-[#ffd45a]">סמני וי על המקצוע שאת מלמדת.</p>
            {subjects.length === 0 ? (
              <p className="mt-3">עדיין אין מקצועות במאגר.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {subjects.map((s) => {
                  const on = selected.includes(s.id);
                  const disabled = !on && selected.length >= maxPick;
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
            )}
            {isYearly && selected.length > 0 && selected.length < YEARLY_INCLUDED_SUBJECTS && (
              <p className="mt-3 text-[#ffd45a]">
                תרצי עוד? מקצוע נוסף כלול במחיר – אפשר לסמן אותו עכשיו, או להוסיף בכל שלב במהלך השנה (הוא יסתיים יחד
                עם המנוי).
              </p>
            )}
          </section>
        )}

        {needsLocation && (
          <section className="space-y-4" aria-labelledby="loc-h">
            <h3 id="loc-h" className="text-3xl">עוד שני פרטים לרכישה הראשונה</h3>
            <LocationFields />
          </section>
        )}

        <div className="gate-strip gate-total">
          <div className="w-full space-y-1">
            <div className="flex justify-between gap-4">
              <span>מחיר המסלול</span>
              <GateShekel agorot={basePrice} />
            </div>
          </div>
          <div className="flex w-full items-baseline justify-between gap-4 border-t-2 border-dashed border-[#ffd45a]/60 pt-2">
            <span className="text-2xl">סה״כ לתשלום</span>
            <span className="gate-price">
              <GateShekel agorot={total} />
            </span>
          </div>
        </div>

        <div className="text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="submit" disabled={pending || !canSubmit} className="btn btn-gold btn-gate py-2 disabled:opacity-50">
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" aria-hidden />}
              לתשלום ואישור {arrow}
            </button>
            {plan === "yearly" && (
              <button
                type="submit"
                name="skipSubjects"
                value="1"
                disabled={pending}
                className="btn gate-skip py-2"
                data-tip="אפשר לבחור את המקצועות גם אחרי התשלום, בחשבון שלך (המקצועות שלי). כל עוד לא התבצעה הורדה במקצוע – אפשר להחליף אותו. עד הבחירה אין גישה להורדות."
              >
                דלג – אבחר מאוחר יותר
              </button>
            )}
          </div>
          {!canSubmit && needsMulti && (
            <p className="mt-2 text-[#ffd45a]">
              יש לבחור לפחות מקצוע אחד כדי להמשיך.
            </p>
          )}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-base opacity-80">
            <Lock className="h-4 w-4" aria-hidden />
            התשלום המאובטח יחובר בקרוב; כרגע ההזמנה נרשמת מיידית לצורך הדגמה
          </p>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="kind" value={kind} />
      {plan && <input type="hidden" name="plan" value={plan} />}
      {materialId && <input type="hidden" name="materialId" value={materialId} />}
      {kind === "bundle" && categoryId && <input type="hidden" name="categoryId" value={categoryId} />}
      {needsMulti && selected.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}

      {state?.error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-4 py-3 text-sm animate-pop">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {needsMulti && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="block text-sm font-semibold">בחרי מקצוע (מקצוע נוסף כלול במחיר)</label>
            <span className="text-xs text-muted">{selected.length}/{maxPick}</span>
          </div>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted">עדיין אין מקצועות במאגר.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {subjects.map((s) => {
                const on = selected.includes(s.id);
                const disabled = !on && selected.length >= maxPick;
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition ${
                      on
                        ? "border-pink bg-pink-soft shadow-sm"
                        : disabled
                          ? "border-foreground/10 opacity-50 cursor-not-allowed"
                          : "border-foreground/10 hover:border-pink/50 hover:bg-pink-soft/40 transition-transform hover:-translate-y-0.5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-pink"
                      checked={on}
                      disabled={disabled}
                      onChange={() => toggle(s.id)}
                    />
                    <span>{s.icon}</span>
                    <span>{s.title}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {needsLocation && (
        <div className="space-y-4">
          <p className="text-sm font-semibold">עוד שני פרטים לרכישה הראשונה</p>
          <LocationFields light />
        </div>
      )}

      <div className="rounded-2xl bg-blue-soft/60 p-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span>מחיר בסיס</span>
          <span className="font-semibold">{formatPrice(basePrice)}</span>
        </div>
        <div className="h-px bg-blue/15 my-1" />
        <div className="flex justify-between text-lg">
          <span className="font-bold">סה״כ לתשלום</span>
          <span className="font-display font-bold text-blue-deep">{formatPrice(total)}</span>
        </div>
      </div>

      <button type="submit" disabled={pending || !canSubmit} className="btn btn-primary w-full text-base py-3">
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
        לתשלום ואישור
      </button>
      <p className="text-xs text-muted text-center flex items-center justify-center gap-1.5">
        <Lock className="h-3.5 w-3.5" />
        התשלום המאובטח יחובר בקרוב; כרגע ההזמנה נרשמת מיידית לצורך הדגמה
      </p>
    </form>
  );
}
