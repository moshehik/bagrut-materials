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
            <video src={src} controls autoPlay playsInline preload="metadata" controlsList="nodownload" className="max-h-full w-full" />
          </div>
        )}
      </dialog>
    </>
  );
}
