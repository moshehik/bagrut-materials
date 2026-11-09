"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Loader2, RotateCcw, SendHorizontal, Sparkles } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; tools?: { name: string; label: string; ok: boolean }[]; error?: boolean };

const STORAGE_KEY = "admin-assistant-chat-v1";
const MAX_Q = 1200;
const SUGGESTIONS = [
  "מה המצב באתר השבוע?",
  "כמה הורדות היו בשבוע האחרון לעומת השבוע שלפניו?",
  "אילו חומרים הורידו הכי הרבה החודש?",
  "מה פתוח לטיפול אצלי עכשיו?",
  "יש הורדות ללא הרשאה?",
  "איפה משנים מחיר של חומר?",
];

/** הופך נתיבי ניהול בתשובה (/admin/...) לקישורים פנימיים; כל השאר טקסט רגיל */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(\/admin(?:\/[a-z0-9_-]+)*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\/admin(?:\/[a-z0-9_-]+)*$/.test(p) ? (
          <Link key={i} href={p} dir="ltr" className="text-blue-deep underline underline-offset-2 hover:no-underline">
            {p}
          </Link>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function AssistantChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // היסטוריה שמורה בדפדפן בלבד (אין טבלה במסד); כל גישה ל-storage עטופה ב-try
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        if (Array.isArray(parsed)) setMsgs(parsed.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-40));
      }
    } catch {
      /* ללא storage – השיחה תחיה רק בעמוד */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* ignore */
    }
  }, [msgs, loaded]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (textRaw: string) => {
      const text = textRaw.trim().slice(0, MAX_Q);
      if (!text || busy) return;
      // ההיסטוריה שנשלחת: רק הודעות תקינות (בלי שגיאות), והשרת חותך שוב
      const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
      setMsgs((m) => [...m, { role: "user", content: text }]);
      setInput("");
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/admin/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: text, history }),
          signal: ctrl.signal,
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; answer?: string; error?: string; tools?: Msg["tools"] } | null;
        if (res.ok && data?.ok && data.answer) {
          setMsgs((m) => [...m, { role: "assistant", content: data.answer!, tools: data.tools ?? [] }]);
        } else {
          setMsgs((m) => [...m, { role: "assistant", content: data?.error || "משהו השתבש, נסי שוב.", error: true }]);
        }
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setMsgs((m) => [...m, { role: "assistant", content: "שגיאת תקשורת עם השרת.", error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };
  const reset = () => {
    abortRef.current?.abort();
    setMsgs([]);
    setBusy(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="card flex flex-col overflow-hidden" style={{ minHeight: "60vh" }}>
      <div className="flex items-center gap-2 border-b border-foreground/10 px-4 py-3">
        <Sparkles className="h-5 w-5 text-oak-deep" aria-hidden />
        <span className="font-bold">עוזרת הניהול</span>
        <span className="chip bg-blue-soft text-blue-deep">קריאה בלבד</span>
        <button type="button" onClick={reset} disabled={msgs.length === 0 && !busy} className="btn btn-ghost !py-1.5 !px-3 text-xs ms-auto disabled:opacity-40">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> שיחה חדשה
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "62vh" }} aria-live="polite">
        {msgs.length === 0 && !busy && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted">שאלי אותי על מה שקורה באתר: הורדות, משתמשות ומנויים, חומרים, תשלומים, תקלות. אני רק קוראת נתונים ולא משנה כלום; אם צריך לשנות – אגיד באיזה מסך.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} className="chip bg-oak-soft text-oak-deep hover:bg-oak-soft/70 cursor-pointer">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "bg-oak-soft text-oak-deep" : m.error ? "bg-red-50 text-red-800" : "bg-foreground/5"
              }`}
            >
              {m.role === "assistant" && !m.error ? <Linkified text={m.content} /> : m.content}
              {m.tools && m.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-foreground/10 pt-2">
                  <span className="text-xs text-muted">נבדק:</span>
                  {m.tools.map((t, j) => (
                    <span key={j} className={`chip text-xs ${t.ok ? "bg-blue-soft text-blue-deep" : "bg-red-100 text-red-700"}`}>
                      {t.label}
                      {t.ok ? "" : " (נכשל)"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-2xl bg-foreground/5 px-4 py-2.5 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> בודקת...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-foreground/10 p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          maxLength={MAX_Q}
          placeholder="כתבי שאלה... (Enter לשליחה, Shift+Enter לשורה חדשה)"
          className="input flex-1 resize-none"
          aria-label="שאלה לעוזרת"
        />
        <button className="btn btn-oak !py-2.5 !px-4" disabled={busy || !input.trim()} aria-label="שליחה">
          <SendHorizontal className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
        </button>
      </form>
    </div>
  );
}
