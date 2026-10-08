"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Mail, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Props = {
  categoryId: number;
  /** האם המשתמשת מחוברת – אחרת הכפתורים מובילים להתחברות */
  loggedIn: boolean;
  /** כתובת העמוד הנוכחי, לחזרה אחרי התחברות */
  here: string;
  /** "header" = הכפתור הכחול בכרטיס הפרק (במקום "התחברי כדי להוריד קבצים") */
  variant?: "header";
};

/** אגוז ההורדה – אותו אגוז כמו בכרטיסיות התיקייה */
function DownloadNut() {
  return <Image src="/images/mat-cards/nut-download.webp" alt="" width={84} height={67} className="fa-itemnut" aria-hidden />;
}

/** אגוז המייל – כמו בכרטיסיות: אגוז לוז עם אייקון מייל חרות */
function MailNut() {
  return (
    <span className="mtc-mailnut fa-itemnut" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/nuts/one-01.webp" alt="" width={40} height={40} />
      <Mail className="mtc-mailnut-icon" strokeWidth={1.3} />
    </span>
  );
}

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; email: string; files: number; skipped: number }
  | { kind: "error"; message: string };

/**
 * בראש כרטיסיות היחידה: שני כפתורים גלויים מיד (בלי תפריט נפתח) – הורדת כל הקבצים כזיפ אחד, או שליחתם למייל.
 * ההורדה היא קישור רגיל (<a>) כדי שאגוז הטעינה של ההורדות יזהה אותו;
 * השליחה למייל היא POST לאותו נתיב (/api/download-folder/[id]) – הכול עובר דרך הדומיין שלנו (נטפרי).
 */
export function FolderAllActions({ categoryId, loggedIn, here, variant }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // סגירת התפריט בלחיצה בחוץ / Escape (למגע; בעכבר נסגר ביציאה מהכפתור)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const endpoint = `/api/download-folder/${categoryId}`;
  const loginHref = `/login?next=${encodeURIComponent(here)}`;
  const sending = state.kind === "sending";

  async function sendByMail() {
    if (sending) return;
    setOpen(false);
    setState({ kind: "sending" });
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        redirect?: string;
        email?: string;
        files?: number;
        skipped?: number;
      };
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (!res.ok || !data.ok) {
        setState({ kind: "error", message: data.error || "השליחה נכשלה, נסי שוב בעוד רגע" });
        return;
      }
      setState({ kind: "done", email: data.email ?? "", files: data.files ?? 0, skipped: data.skipped ?? 0 });
    } catch {
      setState({ kind: "error", message: "אין חיבור לשרת, נסי שוב בעוד רגע" });
    }
  }

  return (
    <div
      className={`fa-wrap${variant === "header" ? " fa-wrap-hdr" : ""}`}
      ref={wrapRef}
      onMouseEnter={() => !sending && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`fa-trigger${variant === "header" ? " fa-trigger-hdr" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={sending}
      >
        {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {sending ? "שולחים למייל…" : variant === "header" ? "הורידי את כל החומרים" : "הורידי הכל"}
      </button>
      {open && (
        <div className="fa-menu" role="menu">
          <a role="menuitem" href={loggedIn ? endpoint : loginHref} className="fa-item" onClick={() => setOpen(false)}>
            <DownloadNut />
            להורדה
          </a>
          {loggedIn ? (
            <button type="button" role="menuitem" className="fa-item" onClick={sendByMail}>
              <MailNut />
              לשליחה למייל שלי
            </button>
          ) : (
            <a role="menuitem" href={loginHref} className="fa-item">
              <MailNut />
              לשליחה למייל שלי
            </a>
          )}
        </div>
      )}
      <div className="fa-status" role="status" aria-live="polite">
        {state.kind === "done" && (
          <span className="fa-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            נשלח! {state.files} קבצים (זיפ אחד) בדרך אל <bdi dir="ltr">{state.email}</bdi>
            {state.skipped > 0 && ` · ${state.skipped} קבצים לא נכללו`}
          </span>
        )}
        {state.kind === "error" && (
          <span className="fa-err">
            <AlertCircle className="h-4 w-4" aria-hidden />
            {state.message}
          </span>
        )}
      </div>
    </div>
  );
}
