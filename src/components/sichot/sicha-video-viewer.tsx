"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

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
        {open && (
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
        {open && blocked && (
          <div role="alert" className="bg-[#fff6d6] px-4 py-3 text-sm leading-relaxed text-[#3b2f10]">
            הסרטון לא נטען. אם את גולשת דרך מסנן תוכן (נטפרי) – ייתכן שהוא חסום עד שייבדק.{" "}
            <a href={src} target="_blank" rel="noopener noreferrer" className="font-bold underline">
              פתיחה בלשונית נפרדת
            </a>{" "}
            (שם נטפרי מציג כפתור "שלח בקשה לבדיקה").
          </div>
        )}
      </dialog>
    </>
  );
}
