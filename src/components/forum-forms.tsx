"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import {
  createThread,
  deleteReply,
  deleteThread,
  replyThread,
  reportContent,
  type ForumState,
} from "@/lib/actions/forum";
import { FORUM_KINDS, FORUM_LABEL, type ForumKind } from "@/lib/forum-utils";
import { KindIcon, KindTag, ThinIcon } from "@/components/forum-kind-icon";

/**
 * טפסי הפורום בעיצוב "שימי לב!": ריבוע בצבע לפי סוג ההודעה (שאלה זהב בהיר / הערה סלמון / טיפ תכלת; תשובה/תגובה – אותו צבע בגוון בהיר יותר),
 * במסגרת שחורה, ומעליו תווית עם שם הסוג. `demo` = עמוד הדוגמה (/forum-preview) – שום דבר לא נשלח.
 */

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border-2 border-black bg-white px-4 py-3 text-base text-[#8a1508] animate-pop">
      <AlertCircle className="h-4 w-4 mt-1 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

const PLACEHOLDER: Record<ForumKind, string> = {
  question: "מה את רוצה לשאול על היחידה הזו? פרטי כמה שיותר – ככה יהיה קל לעזור",
  note: "מה ההערה שלך על היחידה הזו?",
  tip: "איזה טיפ עובד לך בהוראת היחידה הזו?",
};

/** הלחצנים שלפני הפורום: שאלה / הערה / טיפ. בלחיצה נפתחת תיבת כתיבה בצבע הסוג, ומה שנכתב מופיע בפורום */
export function ForumComposer({ categoryId, demo = false }: { categoryId: number; demo?: boolean }) {
  const [kind, setKind] = useState<ForumKind | null>(null);
  const [demoSent, setDemoSent] = useState(false);
  // אחרי פרסום מוצלח התיבה נסגרת (והטופס מתאפס עם הסגירה)
  const [state, action, pending] = useActionState(async (prev: ForumState, fd: FormData) => {
    const res = await createThread(prev, fd);
    if (res?.ok) setKind(null);
    return res;
  }, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-3">
      <p className="text-xl">מה תרצי לכתוב בפורום?</p>
      <div className="flex flex-wrap gap-3" role="group" aria-label="סוג ההודעה">
        {FORUM_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`forum-kind-btn fk-${k}`}
            aria-pressed={kind === k}
            onClick={() => {
              setDemoSent(false);
              setKind(kind === k ? null : k);
            }}
          >
            <KindIcon kind={k} />
            {FORUM_LABEL[k]}
          </button>
        ))}
      </div>

      {kind && (
        <form
          ref={formRef}
          action={action}
          onSubmit={(e) => {
            if (!demo) return;
            e.preventDefault();
            setDemoSent(true);
            setKind(null);
          }}
          className={`fk-${kind} animate-fade-up`}
        >
          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="kind" value={kind} />
          <div className="forum-box space-y-3">
            <KindTag kind={kind} />
            <ErrorBox error={state?.error} />
            <textarea
              name="body"
              required
              minLength={4}
              rows={4}
              autoFocus
              className="gate-input !bg-white resize-y"
              placeholder={PLACEHOLDER[kind]}
              aria-label={FORUM_LABEL[kind]}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="gate-soft text-base">מופיעה לפי מספרך האישי · רק על היחידה הזו</span>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost !text-black !border-black" onClick={() => setKind(null)}>
                  ביטול
                </button>
                <button type="submit" disabled={pending} className="btn btn-gold">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  פרסמי {FORUM_LABEL[kind]}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {demoSent && (
        <p role="status" className="gate-soft !text-white/90 text-base">
          זו עמוד דוגמה – ההודעה לא נשלחה. באתר האמיתי היא הייתה מופיעה בפורום מיד.
        </p>
      )}
    </div>
  );
}

/** "תשובה" / "תגובה" בתוך ריבוע ההודעה: נפתח חלון לכתיבה, והיא תופיע מתחת להודעה באותו צבע בגוון בהיר יותר */
export function AnswerButton({
  threadId,
  kind = "question",
  demo = false,
}: {
  threadId: number;
  kind?: ForumKind;
  demo?: boolean;
}) {
  const label = kind === "question" ? "תשובה" : "תגובה";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(replyThread, undefined);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        className="forum-del"
        aria-label={`כתבי ${label}`}
        data-tip={`כתבי ${label}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        <ThinIcon name="reply" />
      </button>

      <dialog ref={dialogRef} className={`forum-dialog fk-${kind}`} aria-label={`כתיבת ${label}`}>
        <form
          ref={formRef}
          action={action}
          onSubmit={(e) => {
            if (!demo) return;
            e.preventDefault();
            formRef.current?.reset();
            dialogRef.current?.close();
          }}
        >
          <input type="hidden" name="threadId" value={threadId} />
          <div className="forum-box forum-box-reply space-y-3">
            <KindTag kind={kind === "question" ? "answer" : "reply"} />
            <ErrorBox error={state?.error} />
            <textarea
              name="body"
              required
              minLength={2}
              rows={5}
              className="gate-input !bg-white resize-y"
              placeholder={kind === "question" ? "כתבי את התשובה שלך..." : "כתבי את התגובה שלך..."}
              aria-label={label}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="gate-soft text-base">
                {demo ? "עמוד דוגמה – לא נשלח" : "מופיעה לפי מספרך האישי"}
              </span>
              <div className="forum-dialog-actions flex max-w-full flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost !text-black !border-black"
                  onClick={() => dialogRef.current?.close()}
                >
                  ביטול
                </button>
                <button type="submit" disabled={pending} className="btn btn-gold">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  שלחי {label}
                </button>
              </div>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** העתקת טקסט ההודעה/התשובה ללוח – אייקון העתקה; אחרי הלחיצה הופך לרגע ל-V */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // דפדפן בלי גישה ללוח (או הקשר לא מאובטח) – העתקה דרך שדה זמני
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* אין מה לעשות */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      className="forum-del"
      aria-label="העתקת ההודעה"
      data-tip={copied ? "הועתק!" : "העתקה"}
      onClick={copy}
    >
      <ThinIcon name={copied ? "check" : "copy"} />
    </button>
  );
}

/** מחיקה – מוצגת רק למי שכתבה את ההודעה (הבדיקה נעשית גם בשרת) */
export function DeleteButton({
  id,
  scope,
  warn,
  demo = false,
}: {
  id: number;
  scope: "thread" | "reply";
  /** טקסט האישור לפני המחיקה */
  warn: string;
  demo?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      action={scope === "thread" ? deleteThread : deleteReply}
      onSubmit={(e) => {
        if (demo) {
          e.preventDefault();
          dialogRef.current?.close();
          return;
        }
        setPending(true);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        className="forum-del"
        aria-label="מחיקה"
        data-tip="מחיקה"
        onClick={() => dialogRef.current?.showModal()}
      >
        <ThinIcon name="trash" />
      </button>

      <dialog
        ref={dialogRef}
        className="forum-dialog fk-note"
        aria-label="אישור מחיקה"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="forum-box space-y-3">
          <p className="forum-confirm-title">{warn}</p>
          <p className="gate-soft text-base">אי אפשר לשחזר אחרי המחיקה.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost !text-black !border-black"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
            >
              ביטול
            </button>
            <button type="submit" className="btn btn-gold" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThinIcon name="trash" />}
              כן, למחוק
            </button>
          </div>
        </div>
      </dialog>
    </form>
  );
}

/**
 * דיווח על תוכן לא הולם – אייקון אזהרה בלבד, עם טולטיפ. ההודעה מגיעה למנהלת (ר' /admin/forum).
 * אחרי הדיווח האייקון הופך ל-V; לחיצה נוספת על ה-V מבטלת את הדיווח (חוזר לאזהרה).
 * `initiallyReported` = כבר יש דיווח פתוח שלה על התוכן הזה (נשמר גם אחרי רענון).
 */
export function ReportButton({
  target,
  demo = false,
  initiallyReported = false,
}: {
  target: { threadId: number } | { postId: number };
  demo?: boolean;
  initiallyReported?: boolean;
}) {
  const [state, action, pending] = useActionState(reportContent, undefined);
  const [demoReported, setDemoReported] = useState(false);
  const reported = demo ? demoReported : state?.ok ? !!state.reported : initiallyReported;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!demo) return;
        e.preventDefault();
        setDemoReported(!demoReported);
      }}
    >
      {"threadId" in target ? (
        <input type="hidden" name="threadId" value={target.threadId} />
      ) : (
        <input type="hidden" name="postId" value={target.postId} />
      )}
      {reported && <input type="hidden" name="cancel" value="1" />}
      <button
        type="submit"
        className="forum-del"
        disabled={pending}
        aria-label={reported ? "ביטול הדיווח" : "דיווח על תוכן לא הולם"}
        data-tip={
          reported
            ? "הדיווח נשלח למנהלת. לביטול הדיווח לחצי על הוי"
            : (state?.error ?? "לדיווח על תוכן לא הולם")
        }
      >
        <ThinIcon name={reported ? "check" : "warn"} />
      </button>
    </form>
  );
}
