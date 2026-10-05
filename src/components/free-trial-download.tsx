"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { claimFreeTrialAction } from "@/lib/actions/free-trial";

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
      window.location.href = r.href;
      // הכרטיס עובר למצב "נרכש" אחרי שההורדה התחילה
      setTimeout(() => router.refresh(), 1500);
    });

  return (
    <>
      <button type="button" className={`${className ?? ""} cursor-pointer`} onClick={open}>
        {children}
      </button>
      <dialog ref={ref} className="fix-dialog" aria-label="הורדה חינמית">
        <div className="fix-dialog-box">
          <div className="fix-dialog-head">
            <h3>{state === "available" ? "ההורדה החינמית שלך" : "עוד רגע ההורדה החינמית שלך"}</h3>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={close}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {state === "available" ? (
            <>
              <p className="fix-dialog-sub">
                זו ההורדה החינמית האחת שלך, על כל חומר שתבחרי. להוריד את <b>{title}</b>?
                <br />
                החומר יישאר שלך, ותוכלי להוריד אותו שוב בכל פעם.
              </p>
              {error && (
                <p role="alert" className="mb-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-gold text-sm py-2" onClick={claim} disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  כן, להורדה
                </button>
                <button type="button" className="btn btn-ghost text-sm py-2" onClick={close} disabled={pending}>
                  לא, אבחר חומר אחר
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="fix-dialog-sub">
                כדי לקבל את ההורדה החינמית צריך קודם לאמת את כתובת המייל. זה לוקח דקה: נשלח אלייך קישור, ולוחצים עליו.
              </p>
              <Link href="/account" className="btn btn-gold text-sm py-2">
                לאימות המייל
              </Link>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
