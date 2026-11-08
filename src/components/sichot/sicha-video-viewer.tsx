"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { probeNetfreeVideo } from "@/lib/netfree-probe";

/** הודעת חסימה בעיצוב האתר (חלון הצפייה החום עם מסגרת זהב). compact = פס תחת הנגן אחרי שהנגן עצמו נכשל */
function BlockedNotice({ compact, onTry, href }: { compact?: boolean; onTry?: () => void; href?: string }) {
  return (
    <div className={compact ? "nf-block nf-compact" : "nf-block view-dialog-viewer"} role="alert">
      <div className="nf-card">
        <span className="nf-ico">
          <ShieldAlert className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <h4 className="nf-title">הצפייה בסרטון באתר חסומה בסינון שלך</h4>
        <p className="nf-text">
          נטפרי חוסם סרטונים. אפשר ללחוץ בכרטיס על כפתור המייל ולקבל קישור לסרטון, ולצפות בו משם.
        </p>
        <div className="nf-actions">
          {onTry && (
            <button type="button" className="nf-btn" onClick={onTry}>
              לנסות לנגן בכל זאת
            </button>
          )}
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" className="nf-btn">
              פתיחה בלשונית נפרדת
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** כפתור "לצפייה": פותח את הסרטון בנגן בתוך חלון באתר (מוזרם דרך הדומיין שלנו, ר' /api/sichot/video/[id]?inline=1) */
export function VideoViewerButton({
  src,
  title,
  className,
  children,
  tip,
  label,
}: {
  src: string;
  title: string;
  className?: string;
  children: React.ReactNode;
  tip?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // מסנן תוכן (נטפרי) מחליף סרטון בדף "שלח בקשה לבדיקה" – בתוך נגן מוטמע זה נראה כמסך ריק/שגיאה. מזהים (שגיאת נגן, או שלא נטען
  // תוך 10 שניות) ומציעים לפתוח את הסרטון בלשונית נפרדת, שם נטפרי מציג את כפתור הבקשה.
  const [blocked, setBlocked] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  // בדיקה מראש (פעם בכמה שעות, נשמרת בדפדפן): האם המסנן חוסם סרטונים? אם כן – מסבירים מיד במקום נגן שנכשל
  const [probe, setProbe] = useState<"idle" | "checking" | "blocked" | "ok">("idle");
  const [tryAnyway, setTryAnyway] = useState(false);
  useEffect(() => {
    if (!open) {
      setTryAnyway(false);
      return;
    }
    let live = true;
    setProbe("checking");
    probeNetfreeVideo().then((b) => live && setProbe(b ? "blocked" : "ok"));
    return () => {
      live = false;
    };
  }, [open]);
  const showPlayer = open && (probe === "ok" || tryAnyway);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    if (!open) {
      setBlocked(false);
      return;
    }
    const timer = setTimeout(() => {
      const v = ref.current?.querySelector("video");
      if (v && v.readyState < 1) setBlocked(true);
    }, 10_000);
    return () => clearTimeout(timer);
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
      <button type="button" className={className} data-tip={tip} aria-label={label} onClick={() => setOpen(true)}>
        {children}
      </button>
      <dialog ref={ref} className="view-dialog">
        <div className="view-dialog-head">
          <h3>{title}</h3>
          <button type="button" className="fix-close" aria-label="סגירה" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {/* הנגן נטען רק כשהחלון פתוח, ונעלם (ועוצר) עם הסגירה */}
        {showPlayer && (
          <div className="view-dialog-viewer flex items-center justify-center bg-black">
            <video
              src={src}
              controls
              autoPlay
              playsInline
              preload="metadata"
              controlsList="nodownload"
              className="max-h-full w-full"
              onError={() => setBlocked(true)}
              onLoadedMetadata={() => setBlocked(false)}
            />
          </div>
        )}
        {open && probe === "blocked" && !tryAnyway && <BlockedNotice onTry={() => setTryAnyway(true)} />}
        {showPlayer && blocked && <BlockedNotice compact href={src} />}
      </dialog>
    </>
  );
}
