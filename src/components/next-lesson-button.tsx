"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ListChecks } from "lucide-react";
import s from "@/app/home.module.css";

export type NextLessonOption = { id: number; title: string; nextHref: string; nextHint: string };

/**
 * "לשיעור הבא בתור": במקצוע אחד – קישור ישיר לשיעור. בכמה מקצועות – שואל באיזה מקצוע,
 * ואז שולח אותה ישר לשיעור שאחרי האחרון שהורידה בו (החישוב בשרת: src/lib/home-personal.ts).
 */
export function NextLessonButton({ options }: { options: NextLessonOption[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (options.length === 0) return null;

  const content = (
    <>
      <ListChecks className="h-5 w-5 plans-icon" strokeWidth={1.75} aria-hidden />
      לשיעור הבא בתור
      <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </>
  );

  if (options.length === 1) {
    return (
      <Link href={options[0].nextHref} className="btn btn-ghost btn-plans text-base" title={options[0].nextHint}>
        {content}
      </Link>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-plans text-base" onClick={() => setOpen(true)}>
        {content}
      </button>
      {open && (
        <div
          className={s.nlOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className={s.nlCard} role="dialog" aria-modal="true" aria-label="באיזה מקצוע?">
            <button type="button" className={s.nlClose} aria-label="סגירה" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
              </svg>
            </button>
            <h2>באיזה מקצוע?</h2>
            <div className={s.nlList}>
              {options.map((o) => (
                <Link key={o.id} href={o.nextHref} className={s.nlItem} onClick={() => setOpen(false)}>
                  <b>{o.title}</b>
                  <span>{o.nextHint}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
