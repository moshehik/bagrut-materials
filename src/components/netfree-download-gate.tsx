"use client";

import { useEffect, useRef, useState } from "react";
import { NetfreeNotice } from "@/components/netfree-notice";

const isNetfreeCookie = () => {
  try {
    return /(?:^|;\s*)nf=1(?:;|$)/.test(document.cookie);
  } catch {
    return false;
  }
};

/**
 * קישור הורדה של סרטון: למי שהדפדפן שלה זוהה ברקע כמאחורי נטפרי (קוקי nf=1, ר' netfree-detector.tsx) – לפני ההורדה
 * מופיעה הודעה בעיצוב האתר ("ההורדה חסומה בסינון שלך") עם אפשרות להמשיך להוריד בכל זאת. לכל השאר – קישור רגיל.
 */
export function NetfreeDownloadGate({
  href,
  mailUrl,
  className,
  tip,
  label,
  children,
}: {
  href: string;
  /** כתובת שליחת הסרטון למייל (POST) – כפתור "שליחה למייל" בהודעה */
  mailUrl?: string;
  className?: string;
  tip?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => setOpen(false);
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  return (
    <>
      <a
        href={href}
        className={className}
        data-tip={tip}
        aria-label={label}
        onClick={(e) => {
          if (isNetfreeCookie()) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </a>
      <dialog ref={ref} className="nf-dialog" onClick={(e) => e.target === ref.current && setOpen(false)}>
        {open && (
          <NetfreeNotice mailUrl={mailUrl}>
            <a href={href} className="nf-btn" onClick={() => setOpen(false)}>
              להמשיך להורדה
            </a>
            <button type="button" className="nf-btn" onClick={() => setOpen(false)}>
              סגירה
            </button>
          </NetfreeNotice>
        )}
      </dialog>
    </>
  );
}

/**
 * שורת "הורדה בחדות מלאה" למצגות – מופיעה רק למי שזוהתה כנטפרי (למי שלא, ההורדה הרגילה כבר בחדות המקור).
 * בנויה כמו שורת "לעריכת שינויים בקובץ" (.mtc-lower > .mtc-tools > .mtc-row).
 */
export function NetfreeHqRow({ href, nut }: { href: string; nut: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isNetfreeCookie());
    const h = (e: Event) => setOn(Boolean((e as CustomEvent).detail));
    window.addEventListener("nf-detected", h);
    return () => window.removeEventListener("nf-detected", h);
  }, []);
  if (!on) return null;
  return (
    <div className="mtc-lower mtc-lower-hq">
      <div className="mtc-tools">
        <a href={`${href}${href.includes("?") ? "&" : "?"}hq=1`} className="mtc-row" data-tip={"הורדה בחדות מלאה – קובץ כבד (עד כ-35MB),\nוההורדה עשויה להימשך זמן"}>
          {nut}
          <span>הורדה בחדות מלאה</span>
        </a>
      </div>
    </div>
  );
}
