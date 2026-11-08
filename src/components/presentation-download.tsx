"use client";

import { useEffect, useRef, useState } from "react";
import { startFileDownload } from "@/components/download-loader";

const isNetfreeCookie = () => {
  try {
    return /(?:^|;\s*)nf=1(?:;|$)/.test(document.cookie);
  } catch {
    return false;
  }
};

const LOCAL_KEY = "edge-notice-dismissed-v1";

function logEdgeNotice(action: "shown" | "dismissed" | "regular" | "hq") {
  try {
    void fetch("/api/edge-notice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

/** סמל דמוי Edge (גל כחול-ירוק) – ציור מוטמע, בלי תמונה (נטפרי/אתרוג חוסמים תמונות) */
function EdgeMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" fill="#0e7bd8" />
      <path d="M8 27c0-9 7-15 16-15 8 0 14 5 14 12 0 5-3 8-8 8-4 0-6-2-6-5 0-3 2-4 4-4h8" fill="none" stroke="#3fd0a0" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M10 31c2 7 9 11 17 10" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

/** הורדת שני חלקי "חדות מלאה" בלחיצה אחת: חלק 1 מיד, חלק 2 אחרי רגע (כמו "הורדה בקבצים נפרדים" של תיקייה) */
export function downloadBothParts(href: string) {
  const sep = href.includes("?") ? "&" : "?";
  startFileDownload(`${href}${sep}hq=1&part=1&of=2`);
  window.setTimeout(() => startFileDownload(`${href}${sep}hq=1&part=2&of=2`), 1800);
}

/**
 * קישור ההורדה הרגיל של מצגת. למי שזוהתה כמאחורי נטפרי – לפני ההורדה מופיעה הודעה בעיצוב האתר: בצפייה ב-Edge הרקע עלול להיות לבן
 * על המסך (בהדפסה הוא מופיע), עם הורדה רגילה / הורדה בחדות מלאה (2 קבצים, מוצגים גם ב-Edge) ו"אל תציגי לי שוב".
 * ההעדפה נשמרת פר-משתמשת בשרת (יומן הביקורת, ר' /api/edge-notice) וגם בדפדפן; כל פעולה נרשמת ביומן.
 */
export function PresentationDownloadGate({
  href,
  className,
  tip,
  label,
  children,
}: {
  href: string;
  className?: string;
  tip?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const checking = useRef(false);

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

  const finish = (hq: boolean) => {
    if (skip) {
      logEdgeNotice("dismissed");
      try {
        localStorage.setItem(LOCAL_KEY, "1");
      } catch {}
    }
    logEdgeNotice(hq ? "hq" : "regular");
    setOpen(false);
    if (hq) downloadBothParts(href);
    else startFileDownload(href);
  };

  return (
    <>
      <a
        href={href}
        className={className}
        data-tip={tip}
        aria-label={label}
        onClick={(e) => {
          if (!isNetfreeCookie()) return; // לא בנטפרי – הורדה רגילה
          try {
            if (localStorage.getItem(LOCAL_KEY) === "1") return;
          } catch {}
          if (checking.current) return;
          e.preventDefault();
          e.stopPropagation(); // לא להפעיל את אגוז הטעינה פעמיים (startFileDownload מפעיל אותו בעצמו)
          checking.current = true;
          // ההעדפה פר-משתמשת בשרת: אם כבר סימנה "אל תציגי לי שוב" (במכשיר אחר) – ממשיכים ישר להורדה
          fetch("/api/edge-notice", { cache: "no-store" })
            .then((r) => r.json() as Promise<{ dismissed?: boolean }>)
            .catch(() => ({ dismissed: false }))
            .then((d) => {
              checking.current = false;
              if (d.dismissed) {
                try {
                  localStorage.setItem(LOCAL_KEY, "1");
                } catch {}
                startFileDownload(href);
                return;
              }
              setSkip(false);
              logEdgeNotice("shown");
              setOpen(true);
            });
        }}
      >
        {children}
      </a>
      <dialog ref={ref} className="nf-dialog" onClick={(e) => e.target === ref.current && setOpen(false)}>
        {open && (
          <div className="nf-block">
            <div className="nf-card" role="alert">
              <EdgeMark className="mx-auto mb-2 h-12 w-12" />
              <h4 className="nf-title">אי אפשר לצפות במצגת הזו ב-Edge</h4>
              <p className="nf-text">בצפייה ב-Edge הרקעים של המצגת עלולים להיות לבנים על המסך (בהדפסה הם מופיעים). לצפייה תקינה אפשר לפתוח בכרום, או להוריד בחדות מלאה בשני קבצים.</p>
              <label className="nf-text mt-2 flex items-center justify-center gap-2">
                <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
                אל תציגי לי שוב
              </label>
              <div className="nf-actions">
                <button type="button" className="nf-btn nf-btn-main" onClick={() => finish(true)}>
                  הורדה בחדות מלאה (2 קבצים)
                </button>
                <button type="button" className="nf-btn" onClick={() => finish(false)}>
                  הורדה רגילה
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
