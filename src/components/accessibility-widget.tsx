"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Accessibility, X, RotateCcw, ZoomIn, Contrast, Link2, CirclePause, Type, type LucideIcon } from "lucide-react";

const STORAGE_KEY = "bagrut-a11y";

type Key =
  | "a11y-large-text"
  | "a11y-high-contrast"
  | "a11y-underline-links"
  | "a11y-no-motion"
  | "a11y-readable";
type State = Record<Key, boolean>;

const OPTIONS: readonly { key: Key; label: string; hint: string; Icon: LucideIcon }[] = [
  { key: "a11y-large-text", label: "הגדלת טקסט", hint: "כל הכתוב באתר גדול יותר", Icon: ZoomIn },
  { key: "a11y-high-contrast", label: "ניגודיות גבוהה", hint: "צבעים כהים וחדים לקריאה קלה", Icon: Contrast },
  { key: "a11y-underline-links", label: "הדגשת קישורים", hint: "קו תחתון מתחת לכל קישור", Icon: Link2 },
  { key: "a11y-no-motion", label: "עצירת אנימציות", hint: "בלי תנועה ובלי הבהובים", Icon: CirclePause },
  { key: "a11y-readable", label: "פונט קריא", hint: "גופן פשוט וברור במקום כתב היד", Icon: Type },
];

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
    <div className="a11yw" dir="rtl">
      {open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-label="תפריט נגישות" className="a11yw-panel animate-pop">
          <div className="a11yw-head">
            <span className="a11yw-head-icon" aria-hidden>
              <Accessibility className="h-5 w-5" />
            </span>
            <div className="a11yw-head-text">
              <h2>נגישות</h2>
              <p>מתאימים את האתר אליך</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                btnRef.current?.focus();
              }}
              className="a11yw-close"
              aria-label="סגירת תפריט נגישות"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="a11yw-list">
            {OPTIONS.map(({ key, label, hint, Icon }) => {
              const on = state[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => update({ ...state, [key]: !on })}
                    className="a11yw-opt"
                  >
                    <span className="a11yw-opt-icon" aria-hidden>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="a11yw-opt-text">
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </span>
                    <span className="a11yw-switch" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="a11yw-foot">
            <button
              type="button"
              onClick={() => update(EMPTY)}
              disabled={activeCount === 0}
              className="a11yw-reset"
              data-tip={"מחזיר את האתר\nלמצבו הרגיל"}
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> איפוס הכול
            </button>
            <Link href="/accessibility" className="a11yw-statement" onClick={() => setOpen(false)}>
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
        className="a11yw-fab"
        data-tip={open ? undefined : "תפריט נגישות\nהגדלת טקסט, ניגודיות,\nעצירת אנימציות ועוד"}
      >
        <Accessibility className="h-7 w-7" aria-hidden />
        {activeCount > 0 && <span className="a11yw-badge">{activeCount}</span>}
      </button>
    </div>
  );
}
