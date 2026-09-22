"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Star, Repeat, Lightbulb, Send, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { rateSicha, toggleUsage, addIdea, type SichaActionState } from "@/lib/actions/sichot";

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-3 py-2 text-xs animate-pop">
      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

export function RatingStars({
  sichaId,
  path,
  myRating,
}: {
  sichaId: number;
  path: string;
  myRating: number | null;
}) {
  const [state, action, pending] = useActionState<SichaActionState, FormData>(rateSicha, undefined);
  const [hover, setHover] = useState<number | null>(null);

  const submitStars = (stars: number) => {
    const fd = new FormData();
    fd.set("sichaId", String(sichaId));
    fd.set("stars", String(stars));
    fd.set("path", path);
    action(fd);
  };

  const shown = hover ?? myRating ?? 0;

  return (
    <div className="flex items-center gap-1" aria-label="דרגי את השיחה">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={pending}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          onClick={() => submitStars(n)}
          aria-label={`דרגי ${n} מתוך 5`}
          className="p-0.5"
        >
          <Star
            className={`h-4 w-4 ${n <= shown ? "fill-gold text-gold" : "text-oak/30"}`}
            aria-hidden
          />
        </button>
      ))}
      {state?.error && <ErrorBox error={state.error} />}
    </div>
  );
}

export function UsageToggle({
  sichaId,
  path,
  used,
  count,
}: {
  sichaId: number;
  path: string;
  used: boolean;
  count: number;
}) {
  const [state, action, pending] = useActionState<SichaActionState, FormData>(toggleUsage, undefined);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="sichaId" value={sichaId} />
      <input type="hidden" name="path" value={path} />
      <button
        type="submit"
        disabled={pending}
        className={`chip ${used ? "bg-green-100 text-green-700" : "bg-blue-soft text-blue-deep"}`}
        title={used ? "לחצי כדי לבטל" : "סמני שהשתמשת בשיחה הזו"}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat className="h-3.5 w-3.5" />}
        {used ? "השתמשתי" : "השתמשתי בזה"} · {count}
      </button>
      {state?.error && <ErrorBox error={state.error} />}
    </form>
  );
}

export function IdeaBox({
  sichaId,
  path,
  ideas,
  contributorCount,
}: {
  sichaId: number;
  path: string;
  ideas: { id: number; body: string; teacherName: string }[];
  contributorCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SichaActionState, FormData>(addIdea, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="chip bg-gold-soft text-[#8a6500] inline-flex items-center gap-1"
      >
        <Lightbulb className="h-3.5 w-3.5" aria-hidden />
        {contributorCount > 0 ? `${contributorCount} מורות העשירו ברעיונות` : "הוסיפי רעיון"}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 animate-fade-up">
          {ideas.length > 0 && (
            <ul className="space-y-2">
              {ideas.map((idea) => (
                <li key={idea.id} className="rounded-xl bg-gold-soft/50 px-3 py-2 text-sm">
                  <p className="leading-relaxed">{idea.body}</p>
                  <p className="mt-1 text-xs text-muted">— {idea.teacherName}</p>
                </li>
              ))}
            </ul>
          )}
          <form ref={formRef} action={action} className="space-y-2">
            <input type="hidden" name="sichaId" value={sichaId} />
            <input type="hidden" name="path" value={path} />
            <ErrorBox error={state?.error} />
            <textarea
              name="body"
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              className="input resize-y text-sm"
              placeholder="רעיון למשחק, פעילות, סיפור או מדרש שמשלים את השיחה הזו..."
            />
            <div className="flex justify-end">
              <button type="submit" disabled={pending} className="btn btn-ghost text-sm py-2">
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
