"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Lock, Sparkles, AlertCircle, CreditCard } from "lucide-react";
import { purchaseAction } from "@/lib/actions/purchase";
import { formatPrice, PREMIUM_ADDON_PRICE } from "@/lib/constants";

export type CheckoutSubject = { id: number; title: string; icon: string };

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
  } = props;

  const [state, action, pending] = useActionState(purchaseAction, undefined);
  const [premium, setPremium] = useState(premiumDefault);
  const [selected, setSelected] = useState<number[]>(preselected.slice(0, 3));
  const [subjectId, setSubjectId] = useState<number | undefined>(categoryId ?? preselected[0]);

  const needsSelect = kind === "plan" && plan === "subject_monthly" && !categoryId;
  const needsMulti = kind === "plan" && plan === "custom_monthly";

  const addon = premium && allowPremium && kind !== "premium" ? addonPrice * months : 0;
  const total = basePrice + addon;

  const canSubmit = useMemo(() => {
    if (needsSelect && !subjectId) return false;
    if (needsMulti && (selected.length < 1 || selected.length > 3)) return false;
    return true;
  }, [needsSelect, needsMulti, subjectId, selected]);

  function toggle(id: number) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur;
      return [...cur, id];
    });
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
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#8a1c4f] px-4 py-3 text-sm animate-pop">
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
                    className={`rounded-xl border px-3 py-2.5 text-sm text-start transition ${
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
            <label className="block text-sm font-semibold">בחרי עד 3 מקצועות לפי מערכת השעות שלך</label>
            <span className="text-xs text-muted">{selected.length}/3</span>
          </div>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted">עדיין אין מקצועות במאגר.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {subjects.map((s) => {
                const on = selected.includes(s.id);
                const disabled = !on && selected.length >= 3;
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition ${
                      on
                        ? "border-pink bg-pink-soft shadow-sm"
                        : disabled
                          ? "border-foreground/10 opacity-50 cursor-not-allowed"
                          : "border-foreground/10 hover:border-pink/50 hover:bg-pink-soft/40"
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

      {allowPremium && kind !== "premium" && (
        <label
          className={`flex gap-3 items-start rounded-2xl border p-4 cursor-pointer transition ${
            premium ? "border-gold bg-gold-soft/60" : "border-foreground/10 hover:border-gold/60"
          }`}
        >
          <input
            type="checkbox"
            name="premium"
            className="mt-1 accent-[#d4a017]"
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
