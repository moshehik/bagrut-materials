"use client";

import { useActionState, useState } from "react";
import type { Plan } from "@/db/schema";
import { PLANS, isRetiredPlan } from "@/lib/constants";
import { createManualPurchase, type AdminActionState } from "@/lib/actions/admin";

export type SubjectOption = { id: number; title: string; icon: string | null };

export function ManualPurchaseForm({
  subjects,
  defaultEmail = "",
}: {
  subjects: SubjectOption[];
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    createManualPurchase,
    undefined,
  );
  const [plan, setPlan] = useState<Plan>("yearly");
  const def = PLANS[plan];
  // מקצוע אופציונלי למנוי שנתי / ממלאת מקום 3 חודשים (ריק = כל המקצועות). המסלולים החודשיים הישנים לא מוצעים
  const subjectOptional = plan === "yearly" || plan === "substitute_3m";

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">
        <span className="block mb-1 font-medium">מייל המשתמשת *</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          className="input"
          dir="ltr"
          placeholder="name@example.com"
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">מסלול *</span>
        <select
          name="plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value as Plan)}
          className="input"
        >
          {Object.entries(PLANS)
            .filter(([k]) => !isRetiredPlan(k))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
        </select>
      </label>
      {subjectOptional && (
        <label className="text-sm">
          <span className="block mb-1 font-medium">מקצוע</span>
          <select name="categoryId" className="input" defaultValue="">
            <option value="">כל המקצועות</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon ?? "📘"} {s.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {plan === "bundle" && (
        <label className="text-sm">
          <span className="block mb-1 font-medium">מזהה תיקייה *</span>
          <input name="categoryId" type="number" min={1} required className="input" placeholder="ID מעץ הקטגוריות" />
        </label>
      )}
      {plan === "single" && (
        <label className="text-sm">
          <span className="block mb-1 font-medium">מזהה חומר *</span>
          <input name="materialId" type="number" min={1} required className="input" placeholder="ID החומר" />
        </label>
      )}
      <label className="text-sm">
        <span className="block mb-1 font-medium">תוקף (ימים)</span>
        <input
          name="days"
          type="number"
          min={0}
          className="input"
          placeholder={def.days ? String(def.days) : "0 = ללא הגבלה"}
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">מכסת הורדות</span>
        <input
          name="downloadsLimit"
          type="number"
          min={0}
          className="input"
          placeholder={def.downloadsLimit ? String(def.downloadsLimit) : "ריק = ללא"}
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סכום ששולם (₪)</span>
        <input name="amount" type="number" step="0.5" min={0} className="input" placeholder="0" />
      </label>
      <label className="text-sm sm:col-span-2 lg:col-span-3">
        <span className="block mb-1 font-medium">הערה</span>
        <input name="note" className="input" placeholder="למשל: שולם בהעברה בנקאית" />
      </label>
      <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
        <button className="btn btn-oak" disabled={pending}>
          {pending ? "שומרת…" : "הוספת מנוי"}
        </button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-green-700">המנוי נוסף ✓ (#{state.id})</span>}
      </div>
    </form>
  );
}
