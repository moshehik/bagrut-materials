"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Lock, Sparkles, AlertCircle, CreditCard } from "lucide-react";
import { GateShekel } from "@/components/gate-shekel";
import { LocationFields } from "@/components/auth-forms";
import { purchaseAction } from "@/lib/actions/purchase";
import { formatPrice, PREMIUM_ADDON_PRICE, YEARLY_INCLUDED_SUBJECTS, SUBJECT_HOUSES } from "@/lib/constants";

export type CheckoutSubject = { id: number; title: string; icon: string; slug?: string };

export type CheckoutFormProps = {
  kind: "single" | "bundle" | "plan" | "premium";
  plan?: "subject_monthly" | "custom_monthly" | "yearly";
  materialId?: number;
  categoryId?: number;
  /** רשימת מקצועות ראשיים לבחירה (למנוי מקצוע / מערכת) */
  subjects?: CheckoutSubject[];
  /** מקצועות שנבחרו מראש */
  preselected?: number[];
  basePrice: number;
  /** חודשים לחישוב תוספת פרימיום */
  months: number;
  /** האם הפרימיום מסומן כברירת מחדל */
  premiumDefault?: boolean;
  /** האם ניתן להוסיף פרימיום */
  allowPremium?: boolean;
  /** מחיר תוסף פרימיום לחודש באגורות (ברירת מחדל מהקבועים) */
  addonPrice?: number;
  /** עיצוב "שער" (כמו עמוד המסלולים והמחירים) – למסלולי מנוי */
  gate?: boolean;
  /** תוספת מקצוע למנוי שנתי, לחודש באגורות (× 12 לכל מקצוע מעבר ל-3 הכלולים) */
  extraSubjectPrice?: number;
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
    months,
    premiumDefault = false,
    allowPremium = true,
    addonPrice = PREMIUM_ADDON_PRICE,
    gate = false,
    extraSubjectPrice = 0,
    needsLocation = false,
  } = props;

  const [state, action, pending] = useActionState(purchaseAction, undefined);
  const [premium, setPremium] = useState(premiumDefault);
  const [selected, setSelected] = useState<number[]>(preselected.slice(0, 3));
  const [subjectId, setSubjectId] = useState<number | undefined>(categoryId ?? preselected[0]);

  const needsSelect = kind === "plan" && plan === "subject_monthly" && !categoryId;
  const needsMulti = kind === "plan" && (plan === "custom_monthly" || plan === "yearly");
  /** מנוי שנתי = לפחות 3 מקצועות (כל מקצוע נוסף בתוספת תשלום); מנוי לפי מערכת = עד 3 */
  const isYearly = plan === "yearly";
  const minPick = isYearly ? YEARLY_INCLUDED_SUBJECTS : 1;
  const maxPick = isYearly ? Math.max(subjects.length, minPick) : 3;
  const extraCount = isYearly ? Math.max(0, selected.length - YEARLY_INCLUDED_SUBJECTS) : 0;
  const extrasPrice = extraCount * extraSubjectPrice * 12;

  const addon = premium && allowPremium && kind !== "premium" ? addonPrice * months : 0;
  const total = basePrice + extrasPrice + addon;

  const canSubmit = useMemo(() => {
    if (needsSelect && !subjectId) return false;
    if (needsMulti && (selected.length < minPick || selected.length > maxPick)) return false;
    return true;
  }, [needsSelect, needsMulti, minPick, maxPick, subjectId, selected]);

  function toggle(id: number) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= maxPick) return cur;
      return [...cur, id];
    });
  }

  if (gate) {
    const pickTitle = isYearly
      ? "בחרי מקצועות"
      : needsMulti
        ? "בחרי עד 3 מקצועות"
        : "בחרי מקצוע";
    const left = minPick - selected.length;
    const arrow = <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />;
    return (
      <form action={action} className="mt-8 space-y-8">
        <input type="hidden" name="kind" value={kind} />
        {plan && <input type="hidden" name="plan" value={plan} />}
        {kind === "plan" && plan === "subject_monthly" && subjectId && (
          <input type="hidden" name="categoryId" value={subjectId} />
        )}
        {needsMulti && selected.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}

        {state?.error && (
          <div role="alert" className="gate-strip gate-strip-alert animate-pop">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            <span className="flex-1">{state.error}</span>
          </div>
        )}

        {(needsSelect || needsMulti) && (
          <section aria-labelledby="pick-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="pick-h" className="text-3xl">{pickTitle}</h3>
              {needsMulti && (
                <span className="gate-badge" aria-live="polite">
                  {isYearly
                    ? `נבחרו ${selected.length} (${YEARLY_INCLUDED_SUBJECTS} כלולים${extraCount > 0 ? ` + ${extraCount} נוספים` : ""})`
                    : `נבחרו ${selected.length} מתוך ${maxPick}`}
                </span>
              )}
            </div>
            <p className="mt-1 text-[#ffd45a]">
              {isYearly ? (
                <>
                  סמני וי על {YEARLY_INCLUDED_SUBJECTS} המקצועות שאת מלמדת. מקצוע נוסף –{" "}
                  <GateShekel agorot={extraSubjectPrice} /> × 12 חודשים לכל מקצוע.
                </>
              ) : needsMulti ? (
                "סמני וי על המקצועות שאת מלמדת לפי מערכת השעות שלך."
              ) : (
                "סמני וי על המקצוע שאליו המנוי."
              )}
            </p>
            {subjects.length === 0 ? (
              <p className="mt-3">עדיין אין מקצועות במאגר.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {subjects.map((s) => {
                  const on = needsMulti ? selected.includes(s.id) : subjectId === s.id;
                  const disabled = needsMulti && !on && selected.length >= maxPick;
                  return (
                    <label
                      key={s.id}
                      className={`gate-card gate-pick ${on ? "gate-pick-on" : ""} ${disabled ? "gate-pick-off" : ""}`}
                    >
                      <input
                        type={needsMulti ? "checkbox" : "radio"}
                        className="sr-only"
                        checked={on}
                        disabled={disabled}
                        onChange={() => (needsMulti ? toggle(s.id) : setSubjectId(s.id))}
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
            {needsMulti && isYearly && left > 0 && selected.length > 0 && (
              <p className="mt-3 text-[#ffd45a]">נשארו עוד {left} מקצועות כלולים בלי תוספת.</p>
            )}
          </section>
        )}

        {needsLocation && (
          <section className="space-y-4" aria-labelledby="loc-h">
            <h3 id="loc-h" className="text-3xl">עוד שני פרטים לרכישה הראשונה</h3>
            <LocationFields />
          </section>
        )}

        {allowPremium && kind !== "premium" && (
          <label className={`gate-card gate-pick ${premium ? "gate-pick-on" : ""}`}>
            <input
              type="checkbox"
              name="premium"
              className="sr-only"
              checked={premium}
              onChange={(e) => setPremium(e.target.checked)}
            />
            <span className="gate-check" aria-hidden>
              {premium && <Check className="h-5 w-5" strokeWidth={3} />}
            </span>
            <span className="flex-1">
              <span className="flex flex-wrap items-center gap-x-3 text-xl">
                <Sparkles className="h-5 w-5" aria-hidden />
                הוסיפי פרימיום
                <span className="gate-badge ms-auto">
                  +<GateShekel agorot={addonPrice} /> לחודש
                </span>
              </span>
              <span className="gate-soft block text-base leading-snug">
                שאלות בגרויות קודמות, מצגות, טיפים למסירה, רעיונות לשיעור ופורום המורות. מעלה גם את
                דרגת החברות שלך.
              </span>
            </span>
          </label>
        )}

        <div className="gate-strip gate-total">
          <div className="w-full space-y-1">
            <div className="flex justify-between gap-4">
              <span>מחיר המסלול</span>
              <GateShekel agorot={basePrice} />
            </div>
            {extraCount > 0 && (
              <div className="flex justify-between gap-4">
                <span>
                  {extraCount} {extraCount === 1 ? "מקצוע נוסף" : "מקצועות נוספים"} (<GateShekel agorot={extraSubjectPrice} /> × 12)
                </span>
                <GateShekel agorot={extrasPrice} />
              </div>
            )}
            {addon > 0 && (
              <div className="flex justify-between gap-4">
                <span>פרימיום ({months} {months === 1 ? "חודש" : "חודשים"})</span>
                <GateShekel agorot={addon} />
              </div>
            )}
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
            {isYearly && (
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
              {isYearly ? `יש לבחור לפחות ${minPick} מקצועות כדי להמשיך.` : "יש לבחור לפחות מקצוע אחד כדי להמשיך."}
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
      {kind === "plan" && plan === "subject_monthly" && subjectId && (
        <input type="hidden" name="categoryId" value={subjectId} />
      )}
      {needsMulti && selected.map((id) => <input key={id} type="hidden" name="categoryIds" value={id} />)}

      {state?.error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-4 py-3 text-sm animate-pop">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {needsSelect && (
        <div>
          <label className="block text-sm font-semibold mb-2">לאיזה מקצוע המנוי?</label>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted">עדיין אין מקצועות במאגר.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {subjects.map((s) => {
                const on = subjectId === s.id;
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSubjectId(s.id)}
                    aria-pressed={on}
                    className={`rounded-xl border px-3 py-2.5 text-sm text-start transition transition-transform hover:-translate-y-0.5 ${
                      on
                        ? "border-blue bg-blue-soft text-blue-deep shadow-sm"
                        : "border-foreground/10 hover:border-blue/40 hover:bg-blue-soft/40"
                    }`}
                  >
                    <span className="me-1">{s.icon}</span>
                    {s.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {needsMulti && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="block text-sm font-semibold">
              {isYearly
                ? `בחרי לפחות ${minPick} מקצועות לפי מערכת השעות שלך`
                : "בחרי עד 3 מקצועות לפי מערכת השעות שלך"}
            </label>
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

      {allowPremium && kind !== "premium" && (
        <label
          className={`flex gap-3 items-start rounded-2xl border p-4 cursor-pointer transition ${
            premium ? "border-gold bg-gold-soft/60" : "border-foreground/10 hover:border-gold/60 transition-transform hover:-translate-y-0.5"
          }`}
        >
          <input
            type="checkbox"
            name="premium"
            className="mt-1 accent-[#d9a21b]"
            checked={premium}
            onChange={(e) => setPremium(e.target.checked)}
          />
          <span className="flex-1">
            <span className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-gold" />
              הוסיפי פרימיום
              <span className="chip bg-gold-soft text-[#8a6500] ms-auto">
                +{formatPrice(addonPrice)} לחודש
              </span>
            </span>
            <span className="block text-sm text-muted mt-1">
              פותח את שאלות הבגרויות הקודמות, המצגות, הטיפים למסירה והרעיונות לשיעור – וגם את
              פורום המורות. בנוסף, מעלה את דרגת החברות שלך.
            </span>
          </span>
        </label>
      )}

      <div className="rounded-2xl bg-blue-soft/60 p-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span>מחיר בסיס</span>
          <span className="font-semibold">{formatPrice(basePrice)}</span>
        </div>
        {addon > 0 && (
          <div className="flex justify-between text-[#8a6500]">
            <span>
              תוספת פרימיום ({months} {months === 1 ? "חודש" : "חודשים"})
            </span>
            <span className="font-semibold">{formatPrice(addon)}</span>
          </div>
        )}
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
