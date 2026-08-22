"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Accessibility, X, RotateCcw } from "lucide-react";

const STORAGE_KEY = "bagrut-a11y";

const OPTIONS = [
  { key: "a11y-large-text", label: "הגדלת טקסט", icon: "🔎" },
  { key: "a11y-high-contrast", label: "ניגודיות גבוהה", icon: "◐" },
  { key: "a11y-underline-links", label: "הדגשת קישורים", icon: "🔗" },
  { key: "a11y-no-motion", label: "עצירת אנימציות", icon: "⏸" },
  { key: "a11y-readable", label: "פונט קריא", icon: "Aa" },
] as const;

type Key = (typeof OPTIONS)[number]["key"];
type State = Record<Key, boolean>;

const EMPTY: State = {
  "a11y-large-text": false,
  "a11y-high-contrast": false,
  "a11y-underline-links": false,
  "a11y-no-motion": false,
  "a11y-readable": false,
};

function apply(state: State) {
  const el = document.documentElement;
  for (const k of Object.keys(state) as Key[]) el.classList.toggle(k, state[k]);
}

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>(EMPTY);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // טעינה מ-localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = { ...EMPTY, ...(JSON.parse(raw) as Partial<State>) };
        setState(parsed);
        apply(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback((next: State) => {
    setState(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  // Escape סוגר, לחיצה מחוץ סוגרת
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t) && !btnRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const first = panelRef.current?.querySelector<HTMLElement>("button, a");
      first?.focus();
    }
  }, [open]);

  const activeCount = Object.values(state).filter(Boolean).length;

  return (
    <div className="fixed bottom-5 left-5 z-50 flex flex-col items-start gap-3" dir="rtl">
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="תפריט נגישות"
          className="card w-72 p-4 animate-pop origin-bottom-left"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2">
              <Accessibility className="h-5 w-5 text-blue" aria-hidden /> נגישות
            </h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                btnRef.current?.focus();
              }}
              className="rounded-full p-1 hover:bg-blue-soft transition-transform hover:scale-110"
              aria-label="סגירת תפריט נגישות"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="mt-3 space-y-1.5">
            {OPTIONS.map((o) => {
              const on = state[o.key];
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => update({ ...state, [o.key]: !on })}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition-colors transition-transform hover:-translate-y-0.5 ${
                      on
                        ? "border-blue bg-blue-soft text-blue-deep"
                        : "border-black/10 hover:bg-blue-soft/50"
                    }`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-base shadow-sm" aria-hidden>
                      {o.icon}
                    </span>
                    <span className="flex-1 text-start">{o.label}</span>
                    <span
                      aria-hidden
                      className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-blue" : "bg-gray-300"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          on ? "left-0.5" : "left-4"
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-3 text-sm">
            <button
              type="button"
              onClick={() => update(EMPTY)}
              className="hover-move inline-flex items-center gap-1 text-muted hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> איפוס
            </button>
            <Link href="/accessibility" className="hover-move text-blue-deep hover:underline" onClick={() => setOpen(false)}>
              הצהרת נגישות
            </Link>
          </div>
        </div>
      )}

      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="פתיחת תפריט נגישות"
        className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-blue to-blue-deep text-white shadow-lg shadow-blue/40 transition-transform hover:scale-105 focus-visible:outline-4"
      >
        <Accessibility className="h-7 w-7" aria-hidden />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-pink text-[11px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}
