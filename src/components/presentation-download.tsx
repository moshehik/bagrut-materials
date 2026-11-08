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

/** הורדת שני חלקי "חדות מלאה" בלחיצה אחת: חלק 1 מיד, חלק 2 אחרי רגע (כמו "הורדה בקבצים נפרדים" של תיקייה) */
export function downloadBothParts(href: string) {
  const sep = href.includes("?") ? "&" : "?";
  startFileDownload(`${href}${sep}hq=1&part=1&of=2`, { asDownload: true });
  window.setTimeout(() => startFileDownload(`${href}${sep}hq=1&part=2&of=2`, { asDownload: true }), 2500);
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
  edgeMark,
  chromeMark,
  children,
}: {
  href: string;
  /** סמל Edge (ColourSvg מהשרת – SVG מוטמע, כי נטפרי חוסם תמונות) */
  edgeMark?: React.ReactNode;
  /** סמל Chrome שמוצג ליד המילה "בכרום" בהודעה */
  chromeMark?: React.ReactNode;
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
        data-dl-gate=""
        onClick={(e) => {
          // ההורדה מתחילה תמיד מכאן (startFileDownload), כדי שהודעת נטפרי תופיע לפני ובלי אגוז טעינה תקוע
          e.preventDefault();
          if (!isNetfreeCookie()) {
            startFileDownload(href); // לא בנטפרי – הורדה רגילה
            return;
          }
          try {
            if (localStorage.getItem(LOCAL_KEY) === "1") {
              startFileDownload(href);
              return;
            }
          } catch {}
          if (checking.current) return;
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
              {edgeMark && <div className="mx-auto mb-2 flex justify-center">{edgeMark}</div>}
              <h4 className="nf-title">ב-Edge לא ניתן לצפות במצגת</h4>
              <p className="nf-text">הרקע יוצג לבן. אפשר לצפות בכרום {chromeMark && <span className="mx-0.5 inline-block align-[-5px]">{chromeMark}</span>}, או להוריד בחדות מלאה.</p>
              <label className="nf-check">
                <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
                <span className="nf-check-box" aria-hidden="true" />
                <span>אל תציגי לי שוב</span>
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
