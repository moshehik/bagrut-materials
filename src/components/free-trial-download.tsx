"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { claimFreeTrialAction } from "@/lib/actions/free-trial";
import { startFileDownload } from "@/components/download-loader";

/**
 * כפתור "הורדה אחת חינם": לחיצה פותחת חלונית אישור (זו ההורדה החינמית האחת, שלא תיבזבז בטעות),
 * ובאישור יוצרת את הרכישה של 0 ₪ ומתחילה את ההורדה. מי שעוד לא אימתה מייל מקבלת הסבר וקישור לאימות.
 */
export function FreeTrialDownload({
  materialId,
  title,
  state,
  className,
  children,
}: {
  materialId: number;
  /** שם החומר, להצגה בחלונית האישור */
  title: string;
  state: "available" | "unverified";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = () => {
    setError(null);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  const claim = () =>
    start(async () => {
      const r = await claimFreeTrialAction(materialId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      close();
      // כמו לחיצה על קישור הורדה – האגוז "מכינים את הקובץ" מופיע ונעלם כשהקובץ מגיע
      startFileDownload(r.href);
      // הכרטיס עובר למצב "נרכש" אחרי שההורדה התחילה
      setTimeout(() => router.refresh(), 1500);
    });

  return (
    <>
      <button type="button" className={`${className ?? ""} cursor-pointer`} onClick={open}>
        {children}
      </button>
      {/* אותו עיצוב כמו חלונית "שימי לב" של שינויים בקובץ: מסגרת כחולה עם ניצוץ זהב ולוח זהב בהיר */}
      <dialog
        ref={ref}
        className="fix-dialog fix-dialog-dark"
        aria-label="הורדה חינמית"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="fix-dialog-box">
          <div className="fix-dialog-head">
            <h3>{state === "available" ? "ההורדה החינמית שלך" : "עוד רגע ההורדה החינמית שלך"}</h3>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={close}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {state === "available" ? (
            <div className="fix-inner fix-done">
              <p className="fix-dialog-sub">
                זו ההורדה החינמית האחת שלך, על כל חומר שתבחרי. להוריד את <b>{title}</b>?
                <br />
                החומר יישאר שלך, ותוכלי להוריד אותו שוב בכל פעם.
              </p>
              {error && (
                <p role="alert" className="fix-error">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-gold text-sm py-2 fix-gate-btn"
                  onClick={claim}
                  disabled={pending}
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  כן, להורדה
                </button>
                <button type="button" className="btn btn-ghost text-sm py-2" onClick={close} disabled={pending}>
                  לא, אבחר חומר אחר
                </button>
              </div>
            </div>
          ) : (
            <div className="fix-inner fix-done">
              <p className="fix-dialog-sub">
                כדי לקבל את ההורדה החינמית צריך קודם לאמת את כתובת המייל. זה לוקח דקה: נשלח אלייך קישור, ולוחצים עליו.
              </p>
              <Link href="/account" className="btn btn-gold text-sm py-2 fix-gate-btn">
                לאימות המייל
              </Link>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
