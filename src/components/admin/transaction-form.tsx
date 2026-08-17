"use client";

import { useActionState } from "react";
import { createTransaction, type AdminActionState } from "@/lib/actions/admin";

export const TX_TYPE_LABELS: Record<string, string> = {
  charge: "חיוב",
  refund: "זיכוי",
  manual: "תשלום ידני",
  adjustment: "התאמה",
};

export function TransactionForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    createTransaction,
    undefined,
  );
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">
        <span className="block mb-1 font-medium">מייל משתמשת</span>
        <input
          name="email"
          type="email"
          defaultValue={defaultEmail}
          className="input"
          dir="ltr"
          placeholder="ריק = ללא שיוך"
        />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סוג *</span>
        <select name="type" defaultValue="manual" className="input">
          {Object.entries(TX_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">סכום (₪) *</span>
        <input name="amount" type="number" step="0.5" required className="input" placeholder="זיכוי יירשם כשלילי" />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">אמצעי</span>
        <input name="method" className="input" placeholder="העברה / מזומן / ביט" />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">אסמכתא</span>
        <input name="reference" className="input font-mono" dir="ltr" placeholder="מס' עסקה" />
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium">מזהה רכישה</span>
        <input name="purchaseId" type="number" min={1} className="input" placeholder="אופציונלי" />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="block mb-1 font-medium">הערה</span>
        <input name="note" className="input" />
      </label>
      <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
        <button className="btn btn-oak" disabled={pending}>
          {pending ? "שומרת…" : "רישום תנועה"}
        </button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-green-700">נרשם ✓</span>}
      </div>
    </form>
  );
}
