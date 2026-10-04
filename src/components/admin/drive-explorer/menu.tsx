"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type MenuItem =
  | { key: string; label: string; icon: ReactNode; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | "sep";

/** תפריט ⋯ צף: מקלדת (חצים/Enter/Escape), סגירה בלחיצה בחוץ / גלילה / שינוי גודל, והחזרת פוקוס לכפתור. */
export function MenuPopup({ anchor, items, onClose }: { anchor: HTMLElement; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - mw - 8);
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener("mousedown", down);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      if (anchor.isConnected) anchor.focus();
    };
  }, [anchor, onClose]);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") { btns[(i + 1) % btns.length]?.focus(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { btns[(i - 1 + btns.length) % btns.length]?.focus(); e.preventDefault(); }
    else if (e.key === "Home") { btns[0]?.focus(); e.preventDefault(); }
    else if (e.key === "End") { btns[btns.length - 1]?.focus(); e.preventDefault(); }
    else if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    else if (e.key === "Tab") onClose();
  }

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      onKeyDown={onKey}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {items.map((it, i) =>
        it === "sep" ? (
          <hr key={`s${i}`} />
        ) : (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={it.danger ? "danger" : ""}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            {it.icon}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
