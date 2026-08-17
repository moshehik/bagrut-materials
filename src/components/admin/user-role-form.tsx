"use client";

import { useActionState } from "react";
import type { Tier } from "@/db/schema";
import { TIERS } from "@/lib/constants";
import { updateUser, type AdminActionState } from "@/lib/actions/admin";

export function UserRoleForm({
  id,
  role,
  tier,
}: {
  id: number;
  role: "user" | "admin";
  tier: Tier;
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    updateUser,
    undefined,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="role" defaultValue={role} className="input py-1 w-auto text-xs">
        <option value="user">משתמשת</option>
        <option value="admin">מנהלת</option>
      </select>
      <select name="tier" defaultValue={tier} className="input py-1 w-auto text-xs">
        {Object.entries(TIERS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.icon} {v.label}
          </option>
        ))}
      </select>
      <button className="btn btn-oak text-xs py-1 px-3" disabled={pending}>
        {pending ? "…" : "עדכון"}
      </button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state?.ok && <span className="text-xs text-green-700">✓</span>}
    </form>
  );
}
