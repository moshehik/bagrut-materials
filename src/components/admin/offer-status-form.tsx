"use client";

import { useActionState } from "react";
import { updateSellOffer, type AdminActionState } from "@/lib/actions/admin";

export function OfferStatusForm({ id, status }: { id: number; status: string }) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    updateSellOffer,
    undefined,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 mt-auto">
      <input type="hidden" name="id" value={id} />
      <select name="status" defaultValue={status} className="input py-1 w-auto text-sm">
        <option value="pending">ממתינה</option>
        <option value="accepted">אושרה</option>
        <option value="rejected">נדחתה</option>
      </select>
      <button className="btn btn-oak text-sm py-1 px-3" disabled={pending}>
        {pending ? "…" : "עדכון סטטוס"}
      </button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state?.ok && <span className="text-xs text-green-700">עודכן ✓</span>}
    </form>
  );
}
