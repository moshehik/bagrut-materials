"use client";

import { useState, useTransition } from "react";
import { removePrivateVersionAction } from "@/lib/actions/private-versions";

/** הסרת גרסה פרטית מתוקנת (המורה חוזרת לקובץ המשותף; השורה מסומנת "הוסרה", הקובץ נשאר בדרייב – לא נמחק) */
export function RemovePrivateVersionButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <button
        type="button"
        disabled={pending}
        className="btn btn-ghost text-xs py-1"
        onClick={() => {
          if (!confirm("להסיר את הגרסה הפרטית? המורה תחזור לקבל את הקובץ המשותף. הקובץ נשאר שמור בדרייב (לא נמחק).")) return;
          setError(null);
          start(async () => {
            const r = await removePrivateVersionAction(id);
            if (r.error) setError(r.error);
          });
        }}
      >
        {pending ? "מסירה…" : "הסרת הגרסה הפרטית"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
