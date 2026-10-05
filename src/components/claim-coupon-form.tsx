"use client";

import { useActionState } from "react";
import { claimCouponAction, type CouponActionState } from "@/lib/actions/private-coupons";

export function ClaimCouponForm({ defaultCode }: { defaultCode?: string }) {
  const [state, formAction, pending] = useActionState<CouponActionState, FormData>(claimCouponAction, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center justify-center gap-2">
      <input
        name="code"
        dir="ltr"
        defaultValue={defaultCode}
        placeholder="LZ-XXXX-XXXX"
        className="input w-52 text-center"
        aria-label="קוד קופון"
      />
      <button className="btn btn-gold btn-gate py-2" disabled={pending}>
        {pending ? "…" : "הפעלת קופון"}
      </button>
      {state?.error && <span className="w-full text-center text-sm text-red-300">{state.error}</span>}
      {state?.ok && <span className="w-full text-center text-sm text-green-300">הקופון נוסף ✓</span>}
    </form>
  );
}
