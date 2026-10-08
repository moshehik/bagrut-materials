"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Send } from "lucide-react";
import { contactAction, type MailState } from "@/lib/actions/mail";
import { CONTACT_TOPICS } from "@/lib/contact-topics";

const MAX_MESSAGE = 5000;

/** בורר נושא מותאם (במקום <select> של הדפדפן): כפתור זהב + רשימה צפה, עם מקלדת ו-aria של listbox */
function TopicPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  // אפשרות 0 = "ללא נושא"; השאר לפי CONTACT_TOPICS
  const options = ["", ...CONTACT_TOPICS];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <span className="text-xl" id={`${listId}-label`}>
        נושא הפנייה
      </span>
      <input type="hidden" name="topic" value={value} />
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="gate-input topic-trigger"
      >
        <span className={value ? undefined : "topic-placeholder"}>{value || "בחרי נושא (לא חובה)"}</span>
        <ChevronDown
          className={`topic-chevron h-5 w-5 ${open ? "topic-chevron-open" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={`${listId}-label`}
          className="topic-list animate-pop"
        >
          {options.map((opt, i) => {
            const selected = opt === value;
            return (
              <li
                key={opt || "none"}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                className={`topic-option ${i === active ? "topic-option-active" : ""} ${opt === "" ? "topic-option-none" : ""}`}
              >
                <span>{opt || "ללא נושא"}</span>
                {selected && opt !== "" && <Check className="topic-check h-5 w-5" strokeWidth={2.5} aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** טופס "צרי קשר" – בעיצוב "שער": שדות זהב בהיר במסגרת שחורה בתוך החלונית הכחולה (ראי login/pricing) */
export function ContactForm({
  defaultName = "",
  defaultEmail = "",
}: {
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, action, pending] = useActionState<MailState, FormData>(contactAction, undefined);
  // שדות מבוקרים: React 19 מאפס טופס אחרי שליחה, וכך הודעה ארוכה לא הולכת לאיבוד בשגיאה
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");

  if (state?.ok) {
    return (
      <div className="gate-card text-center animate-pop" role="status">
        <img src="/images/nut-check.png" alt="" aria-hidden className="mx-auto h-12 w-auto" />
        <p className="mt-2 text-2xl">{state.ok}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xl">שם</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="gate-input mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xl">מייל לחזרה</span>
          <input
            name="email"
            type="email"
            required
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="gate-input mt-1 text-left"
          />
        </label>
      </div>
      <TopicPicker value={topic} onChange={setTopic} />
      <label className="block">
        <span className="text-xl">ההודעה</span>
        <textarea
          name="message"
          required
          minLength={5}
          maxLength={MAX_MESSAGE}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="כתבי כאן את השאלה או הבקשה. אם מדובר בחומר מסוים – כדאי לציין את שמו ואת היחידה."
          className="gate-input mt-1 resize-y"
        />
        <span className="block text-base text-[#ffd45a]" aria-hidden>
          {message.length}/{MAX_MESSAGE}
        </span>
      </label>
      {/* honeypot */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state?.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-pink-soft px-4 py-3 text-base text-[#9d4a2a] animate-pop"
        >
          <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}
      <div className="flex justify-center">
        <button type="submit" disabled={pending} className="btn btn-gold btn-gate py-2 disabled:opacity-50">
          <Send className="h-4 w-4" aria-hidden /> {pending ? "שולחת…" : "שליחה"}
        </button>
      </div>
    </form>
  );
}
