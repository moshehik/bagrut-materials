"use client";

import { useActionState, useState } from "react";
import { Flag, Send, Loader2 } from "lucide-react";
import { reportVideoCopyright } from "@/lib/actions/sichot-videos";

/** "דיווח על זכויות יוצרים" – קישור קטן שפותח טופס קצר; בדף סרטון מסוים הוא נשלח עם מזהה הסרטון */
export function CopyrightReport({ videoId }: { videoId?: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(reportVideoCopyright, undefined);

  return (
    <div className="text-base">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 underline underline-offset-2 gate-soft cursor-pointer">
        <Flag className="h-4 w-4" aria-hidden /> דיווח על זכויות יוצרים
      </button>
      {open && (
        <form action={action} className="mt-2 space-y-2 animate-fade-up">
          {videoId && <input type="hidden" name="videoId" value={videoId} />}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          <input name="name" required minLength={2} maxLength={120} className="input font-sans text-base" placeholder="שם" />
          <input name="email" type="email" required dir="ltr" className="input font-sans text-base" placeholder="מייל לחזרה" />
          <textarea
            name="details"
            required
            minLength={5}
            maxLength={3000}
            rows={3}
            className="input resize-y font-sans text-base"
            placeholder={videoId ? "מה הבעיה בסרטון הזה, ומי בעלי הזכויות?" : "איזה סרטון, מה הבעיה, ומי בעלי הזכויות?"}
          />
          {state?.error && (
            <p role="alert" className="text-red-700">
              {state.error}
            </p>
          )}
          {state?.ok && <p role="status">{state.ok}</p>}
          <button type="submit" disabled={pending} className="btn btn-gold btn-gate !px-4 !py-1 !text-lg">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} שליחת הדיווח
          </button>
        </form>
      )}
    </div>
  );
}
