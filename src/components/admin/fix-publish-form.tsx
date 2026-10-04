"use client";

import { useActionState, useTransition } from "react";
import { markFixMerged, publishFix, rejectFix, unpublishFix, type FixState } from "@/lib/actions/fixes";

/** טיפול בבקשת שינוי: מזינים את הטקסט המקורי (בדיוק כמו בקובץ) ואת התיקון, ומפרסמים */
export function FixPublishForm({
  id,
  defaultOriginal,
  defaultCorrected,
}: {
  id: number;
  defaultOriginal: string;
  defaultCorrected: string;
}) {
  const [state, action, pending] = useActionState<FixState, FormData>(publishFix.bind(null, id), undefined);
  const [rejecting, startReject] = useTransition();

  return (
    <form action={action} className="mt-3 grid gap-2">
      <label className="grid gap-1 text-xs font-semibold">
        הטקסט המקורי בקובץ (יסומן בורוד) – בדיוק כפי שמופיע, בתוך פסקה אחת
        <textarea name="originalText" rows={2} required defaultValue={defaultOriginal} className="input" />
      </label>
      <label className="grid gap-1 text-xs font-semibold">
        הטקסט המתוקן (יסומן בתכלת)
        <textarea name="correctedText" rows={2} required defaultValue={defaultCorrected} className="input" />
      </label>
      <label className="grid gap-1 text-xs font-semibold">
        הערה פנימית (לא חובה)
        <input name="adminNote" className="input" />
      </label>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">פורסם ✓</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary text-sm py-2">
          {pending ? "בודקת בקובץ…" : "פרסום כתיקון"}
        </button>
        <button
          type="button"
          disabled={rejecting}
          className="btn btn-ghost text-sm py-2"
          onClick={() => startReject(() => rejectFix(id))}
        >
          דחיית הבקשה
        </button>
      </div>
    </form>
  );
}

export function UnpublishFixButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending}
        className="btn btn-primary text-xs py-1"
        title="אחרי שעדכנת את הקובץ המקורי עצמו: התיקון יוסתר מהכרטיסייה"
        onClick={() => {
          if (confirm("לוודא: הקובץ המקורי כבר עודכן עם התיקון הזה? התיקון יפסיק להופיע בכרטיסייה.")) {
            start(() => markFixMerged(id));
          }
        }}
      >
        שולב בקובץ המקורי
      </button>
      <button
        type="button"
        disabled={pending}
        className="btn btn-ghost text-xs py-1"
        onClick={() => start(() => unpublishFix(id))}
      >
        ביטול פרסום
      </button>
    </div>
  );
}
