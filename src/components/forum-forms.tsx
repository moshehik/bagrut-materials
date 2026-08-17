"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Send, AlertCircle, ChevronDown } from "lucide-react";
import { createThread, replyThread } from "@/lib/actions/forum";

type SubjectOpt = { id: number; title: string; icon: string };

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#8a1c4f] px-4 py-3 text-sm animate-pop">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

export function NewThreadForm({ subjects }: { subjects: SubjectOpt[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createThread, undefined);

  return (
    <div className="card p-5 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-start"
        aria-expanded={open}
      >
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-pink to-[#ec4899] text-white shadow-lg shadow-pink/30">
          <MessageSquarePlus className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="font-bold block">שאלה חדשה</span>
          <span className="text-sm text-muted">שאלי את המורות, התייעצי או שתפי רעיון</span>
        </span>
        <ChevronDown className={`h-5 w-5 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <form action={action} className="mt-5 space-y-4 animate-fade-up">
          <ErrorBox error={state?.error} />
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <label className="block">
              <span className="text-sm font-semibold">כותרת</span>
              <input
                name="title"
                required
                minLength={4}
                maxLength={200}
                className="input mt-1"
                placeholder="למשל: איך לפתוח את פרק ג' בצורה מעניינת?"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">מקצוע (לא חובה)</span>
              <select name="categoryId" className="input mt-1" defaultValue="">
                <option value="">כללי</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-semibold">השאלה / הרעיון</span>
            <textarea
              name="body"
              required
              minLength={10}
              rows={5}
              className="input mt-1 resize-y"
              placeholder="פרטי כמה שיותר – ככה יהיה קל יותר לעזור"
            />
          </label>
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className="btn btn-pink">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              פרסמי
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function ReplyForm({ threadId }: { threadId: number }) {
  const [state, action, pending] = useActionState(replyThread, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="threadId" value={threadId} />
      <ErrorBox error={state?.error} />
      <label className="block">
        <span className="text-sm font-semibold">התגובה שלך</span>
        <textarea
          name="body"
          required
          minLength={2}
          rows={4}
          className="input mt-1 resize-y"
          placeholder="שתפי מהניסיון שלך..."
        />
      </label>
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          שלחי תגובה
        </button>
      </div>
    </form>
  );
}
