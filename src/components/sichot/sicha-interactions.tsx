"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Send, Loader2, AlertCircle, ChevronDown, ThumbsUp } from "lucide-react";
import { toggleUsage, addIdea, type SichaActionState } from "@/lib/actions/sichot";
import { addVideoIdea, toggleVideoUsage } from "@/lib/actions/sichot-videos";

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-3 py-2 text-xs animate-pop">
      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

export function UsageToggle({
  sichaId,
  path,
  used,
  videoId,
}: {
  sichaId: number;
  path: string;
  used: boolean;
  /** בדף סרטון: sichaId לא בשימוש (0) ו-videoId מזהה את הסרטון */
  videoId?: number;
}) {
  const [state, action, pending] = useActionState<SichaActionState, FormData>(videoId ? toggleVideoUsage : toggleUsage, undefined);

  // לייק: לחיצה מסמנת שהשתמשת / נהנית (ועוד לחיצה מבטלת); הכיתוב "N מורות נהנו" יושב בראש הכרטיס (ר' sicha-card.tsx)
  return (
    <form action={action} className="space-y-0.5">
      {videoId ? (
        <input type="hidden" name="videoId" value={videoId} />
      ) : (
        <input type="hidden" name="sichaId" value={sichaId} />
      )}
      <input type="hidden" name="path" value={path} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={used}
        data-tip={"השתמשת? נהנית?\nלחיצה על הלייק תפרגן למורה\nותעזור לשיעור להגיע לעוד מורות"}
        className="sicha-like"
        data-on={used}
      >
        {pending ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <ThumbsUp className="h-6 w-6" aria-hidden />}
        <span>{used ? "תודה שפירגנת!" : "השתמשת? נהנית?"}</span>
      </button>
      {state?.error && <ErrorBox error={state.error} />}
    </form>
  );
}

export function IdeaBox({
  sichaId,
  path,
  ideas,
  defaultOpen = false,
  videoId,
}: {
  /** בדף סרטון: sichaId לא בשימוש (0) ו-videoId מזהה את הסרטון */
  sichaId: number;
  videoId?: number;
  path: string;
  ideas: { id: number; body: string; teacherName: string }[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, action, pending] = useActionState<SichaActionState, FormData>(videoId ? addVideoIdea : addIdea, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="mtc-row" aria-expanded={open}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/nuts/one-02.webp" alt="" width={40} height={40} className="mtc-rownut" aria-hidden />
        <span>{videoId ? "הוספת רעיון: למה הסרטון מתאים לשיעור" : "הוספת תוכן או רעיון לשיעור"}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="mt-3 space-y-3 animate-fade-up">
          {ideas.length > 0 && (
            <ul className="space-y-2">
              {ideas.map((idea) => (
                <li key={idea.id} className="rounded-xl bg-white/70 border-2 border-black px-3 py-2 text-base">
                  <p className="leading-relaxed">{idea.body}</p>
                  <p className="mt-1 text-sm gate-soft">— {idea.teacherName}</p>
                </li>
              ))}
            </ul>
          )}
          <form ref={formRef} action={action} className="space-y-2">
            {videoId ? (
              <input type="hidden" name="videoId" value={videoId} />
            ) : (
              <input type="hidden" name="sichaId" value={sichaId} />
            )}
            <input type="hidden" name="path" value={path} />
            <ErrorBox error={state?.error} />
            <textarea
              name="body"
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              className="input resize-y font-sans text-base"
              placeholder={videoId ? "לאיזה שיעור הסרטון מתאים, באיזה שלב להראות אותו, ומה לעשות איתו..." : "רעיון למשחק, פעילות, סיפור או מדרש שמשלים את השיחה הזו..."}
            />
            <div className="flex justify-end">
              <button type="submit" disabled={pending} className="btn btn-gold btn-gate py-2">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                הוספת רעיון
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
