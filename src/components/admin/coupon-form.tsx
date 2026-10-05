"use client";

import { useActionState, useState } from "react";
import { createPrivateCoupon, type CouponActionState } from "@/lib/actions/private-coupons";
import { CopyButton } from "@/components/admin/copy-button";

type Subject = { id: number; title: string };

export function CouponForm({ subjects }: { subjects: Subject[] }) {
  const [state, formAction, pending] = useActionState<CouponActionState, FormData>(createPrivateCoupon, undefined);
  const [benefit, setBenefit] = useState<"percent" | "subjects">("percent");

  return (
    <form action={formAction} className="card p-5 space-y-4">
      <h3 className="font-bold text-lg">קופון פרטי חדש</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm space-y-1">
          <span className="font-semibold">כתובת מייל של המקבלת</span>
          <input name="email" type="email" dir="ltr" className="input w-full" placeholder="name@example.com" />
          <span className="text-xs text-muted block">
            כשהיא נכנסת עם המייל הזה – הקופון מופיע לה ב"קופונים זמינים". בלי מייל: כל מי שמחזיקה בקוד.
          </span>
        </label>
        <label className="text-sm space-y-1">
          <span className="font-semibold">שם הקופון (לשימושך)</span>
          <input name="label" required maxLength={120} className="input w-full" placeholder="לדוגמה: מתנה לאחותי" />
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-semibold">ההטבה</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="benefit" value="percent" checked={benefit === "percent"} onChange={() => setBenefit("percent")} />
            הנחה באחוזים
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="benefit" value="subjects" checked={benefit === "subjects"} onChange={() => setBenefit("subjects")} />
            מקצועות חינם
          </label>
        </div>

        {benefit === "percent" ? (
          <label className="text-sm flex items-center gap-2">
            <input name="percent" type="number" min={1} max={100} defaultValue={30} className="input w-24" />
            % הנחה על הרכישה הבאה (100% = חינם)
          </label>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {subjects.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5">
                  <input type="checkbox" name="subjectIds" value={s.id} />
                  {s.title}
                </label>
              ))}
            </div>
            <label className="text-sm flex items-center gap-2">
              <input name="days" type="number" min={1} max={400} defaultValue={365} className="input w-24" />
              ימי גישה מרגע המימוש
            </label>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm space-y-1">
          <span className="font-semibold">תוקף הקופון עד (לא חובה)</span>
          <input name="expiresAt" type="date" className="input w-full" />
        </label>
        <label className="text-sm space-y-1">
          <span className="font-semibold">הערה פנימית (לא חובה)</span>
          <input name="note" maxLength={1000} className="input w-full" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-oak" disabled={pending}>
          {pending ? "יוצרת…" : "יצירת קופון"}
        </button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && state.code && (
          <span className="text-sm text-green-700 flex items-center gap-2">
            נוצר ✓ הקוד: <b dir="ltr">{state.code}</b>
            <CopyButton text={state.code} label="העתקת קוד" />
          </span>
        )}
      </div>
    </form>
  );
}
