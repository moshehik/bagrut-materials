"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mail, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Props = {
  categoryId: number;
  /** האם המשתמשת מחוברת – אחרת הכפתורים מובילים להתחברות */
  loggedIn: boolean;
  /** כתובת העמוד הנוכחי, לחזרה אחרי התחברות */
  here: string;
  /** "header" = הכפתור הכחול בכרטיס הפרק (במקום "התחברי כדי להוריד קבצים") */
  variant?: "header";
  /** אגוזי הכפתורים (ColourSvg) – מגיעים מהשרת: נטפרי חוסם קובצי תמונה, ולא רוצים את נתוני הווקטורים בחבילת הלקוח */
  nutDownload?: ReactNode;
  nutMail?: ReactNode;
};

/** אגוז ההורדה – אותו אגוז כמו בכרטיסיות התיקייה */
function DownloadNut({ nut }: { nut?: ReactNode }) {
  // eslint-disable-next-line @next/next/no-img-element
  return nut ?? <img src="/images/mat-cards/nut-download.webp" alt="" width={84} height={67} className="fa-itemnut" aria-hidden />;
}

/** אגוז המייל – כמו בכרטיסיות: אגוז לוז עם אייקון מייל חרות */
function MailNut({ nut }: { nut?: ReactNode }) {
  return (
    <span className="mtc-mailnut fa-itemnut" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {nut ?? <img src="/images/nuts/one-01.webp" alt="" width={40} height={40} />}
      <Mail className="mtc-mailnut-icon" strokeWidth={1.3} />
    </span>
  );
}

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; email: string; files: number; skipped: number }
  | { kind: "files"; done: number; total: number }
  | { kind: "filesDone"; total: number; more: number }
  | { kind: "error"; message: string };

/**
 * בראש כרטיסיות היחידה: שני כפתורים גלויים מיד (בלי תפריט נפתח) – הורדת כל הקבצים כזיפ אחד, או שליחתם למייל.
 * ההורדה היא קישור רגיל (<a>) כדי שאגוז הטעינה של ההורדות יזהה אותו;
 * השליחה למייל היא POST לאותו נתיב (/api/download-folder/[id]) – הכול עובר דרך הדומיין שלנו (נטפרי).
 */
export function FolderAllActions({ categoryId, loggedIn, here, variant, nutDownload, nutMail }: Props) {
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

  /** הורדה בקבצים נפרדים (זיפ נחסם בנטפרי): מביאים את רשימת הקבצים ומורידים אחד אחד דרך /api/download/[id] */
  async function downloadAsFiles() {
    if (sending || state.kind === "files") return;
    setOpen(false);
    setState({ kind: "files", done: 0, total: 0 });
    try {
      const res = await fetch(`${endpoint}?list=1`, { headers: { Accept: "application/json" } });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: { id: number; name: string }[]; redirect?: string; error?: string; more?: number };
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (!res.ok || !data.ok || !data.items?.length) {
        setState({ kind: "error", message: data.error || "לא נמצאו קבצים להורדה" });
        return;
      }
      const items = data.items;
      for (let i = 0; i < items.length; i++) {
        setState({ kind: "files", done: i, total: items.length });
        const a = document.createElement("a");
        a.href = `/api/download/${items[i].id}`;
        a.rel = "noopener";
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
        // רווח בין הורדות: הדפדפן (ונטפרי) מטפלים בכל קובץ בנפרד, וההמרה ל-PDF לוקחת כמה שניות
        await new Promise((r) => setTimeout(r, 1800));
      }
      setState({ kind: "filesDone", total: items.length, more: data.more ?? 0 });
    } catch {
      setState({ kind: "error", message: "אין חיבור לשרת, נסי שוב בעוד רגע" });
    }
  }

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
          {loggedIn ? (
            <button type="button" role="menuitem" className="fa-item" onClick={downloadAsFiles}>
              <DownloadNut nut={nutDownload} />
              להורדה בקבצים נפרדים
            </button>
          ) : (
            <a role="menuitem" href={loginHref} className="fa-item">
              <DownloadNut nut={nutDownload} />
              להורדה בקבצים נפרדים
            </a>
          )}
          <a role="menuitem" href={loggedIn ? endpoint : loginHref} className="fa-item" onClick={() => setOpen(false)}>
            <DownloadNut nut={nutDownload} />
            להורדה כזיפ אחד
          </a>
          {loggedIn ? (
            <button type="button" role="menuitem" className="fa-item" onClick={sendByMail}>
              <MailNut nut={nutMail} />
              לשליחה למייל שלי
            </button>
          ) : (
            <a role="menuitem" href={loginHref} className="fa-item">
              <MailNut nut={nutMail} />
              לשליחה למייל שלי
            </a>
          )}
        </div>
      )}
      <div className="fa-status" role="status" aria-live="polite">
        {state.kind === "files" && (
          <span className="fa-ok">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            מורידה קובץ {Math.min(state.done + 1, state.total)} מתוך {state.total || "…"}
          </span>
        )}
        {state.kind === "filesDone" && (
          <span className="fa-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            הורדת {state.total} קבצים התחילה{state.more > 0 ? ` · עוד ${state.more} קבצים לא נכללו (עד 40 בכל פעם)` : ""}
          </span>
        )}
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
