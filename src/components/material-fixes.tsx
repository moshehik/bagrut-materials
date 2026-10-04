"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { submitFixRequest, type FixState } from "@/lib/actions/fixes";

export type CardFix = { number: number; originalText: string; correctedText: string };

/** נוסחי הטולטיפ של שלושת אגוזי התיקונים (כתב גברת לוין, מוצג במעבר עכבר / מיקוד) */
export const FIX_TIPS = {
  edit: "בעריכת שינויים – כאן תוכלי לתקן טעויות",
  view: "לצפייה בשינויים – כאן תוכלי לראות תיקונים שכבר נעשו ולסמן אם את מעוניינת בהם.",
  download: "להורדת הקובץ המתוקן: להורדת הדף עם השינויים.",
} as const;

/** ההודעה הצפה לפני שמורה מסמנת תיקונים */
function FixNotice() {
  return (
    <div className="fix-notice" role="note">
      <b>שימי לב!</b>
      <ol>
        <li>
          מערכת לו&quot;ז העניין עוברת על השינויים הנערכים. אם יתברר שאכן חלה טעות היא תתוקן ותשולב בקובץ המקורי
          תוך מספר ימים.
        </li>
        <li>
          הסימונים שאת מסמנת וכן הצבע המודגש של הטעות ותיקונה מופיעים רק בקובץ לצפייה. כשתורידי אותו תקבלי אותו
          בנראות רגילה.
        </li>
      </ol>
    </div>
  );
}

/** פותח/סוגר <dialog> מקורי לפי state */
function useDialog(open: boolean, onClose: () => void) {
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
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, [onClose]);
  return ref;
}

function Nut({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={40} height={40} className="mtc-rownut" aria-hidden />;
}

/** "לעריכת שינויים בקובץ" – אגוז-כפתור שפותח חלון לכתיבת מה צריך לשנות */
export function FixRequestButton({
  materialId,
  materialTitle,
  lockedHref,
  nutSrc,
}: {
  materialId: number;
  materialTitle: string;
  /** אם אין גישה לקובץ – לאן לשלוח במקום לפתוח את החלון (התחברות / רכישה) */
  lockedHref?: string | null;
  nutSrc: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FixState, FormData>(submitFixRequest, undefined);
  const close = () => setOpen(false);
  const ref = useDialog(open, close);

  const label = (
    <>
      <Nut src={nutSrc} />
      <span>לעריכת שינויים בקובץ</span>
    </>
  );

  return (
    <>
      {lockedHref ? (
        <a href={lockedHref} className="mtc-row" data-tip={FIX_TIPS.edit}>
          {label}
        </a>
      ) : (
        <button type="button" className="mtc-row" data-tip={FIX_TIPS.edit} onClick={() => setOpen(true)}>
          {label}
        </button>
      )}
      <dialog
        ref={ref}
        className="fix-dialog"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="fix-dialog-box">
          <div className="fix-dialog-head">
            <h3>שינויים בקובץ</h3>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={close}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <p className="fix-dialog-sub">{materialTitle}</p>

          {state?.ok ? (
            <div className="fix-done">
              <p>
                הבקשה נשלחה. כשהשינוי יתווסף לקובץ יופיעו בכרטיסייה האפשרויות &quot;לצפייה בשינויים שכבר נעשו&quot; ו
                &quot;להורדת הקובץ המתוקן&quot;.
              </p>
              <button type="button" className="btn btn-primary text-sm py-2" onClick={close}>
                סגירה
              </button>
            </div>
          ) : (
            <form action={action} className="fix-form">
              <input type="hidden" name="materialId" value={materialId} />
              <label>
                מה צריך לשנות?
                <textarea
                  name="requestText"
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={4}
                  className="input"
                  placeholder="למשל: בשאלה 3 כתוב ״מצרים״ וצריך להיות ״מדין״"
                />
              </label>
              <label>
                הטקסט שצריך לתקן, כפי שהוא כתוב בקובץ <span className="fix-optional">(לא חובה, מזרז את הטיפול)</span>
                <textarea name="quoteText" maxLength={1000} rows={2} className="input" />
              </label>
              <FixNotice />
              {state?.error && <p className="fix-error">{state.error}</p>}
              <button type="submit" disabled={pending} className="btn btn-primary text-sm py-2">
                {pending ? "שולחת…" : "שליחת הבקשה"}
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

/**
 * "לצפייה בשינויים שכבר נעשו": קודם ההודעה הצפה "שימי לב!", ואז הקובץ באתר עם הסימונים
 * (מה שהתבקש לתקן בורוד, התיקון בתכלת) לצד רשימת השינויים עם וי ליד כל אחד.
 * הקובץ שיורד מכיל רק את השינויים שסומנו, בנראות רגילה; שינוי בלי וי נשאר כמו במקור.
 */
export function FixViewer({
  materialId,
  fixes,
  downloadHref,
  nutSrc,
}: {
  materialId: number;
  fixes: CardFix[];
  /** כתובת ההורדה הבסיסית (בלי ?fixes) */
  downloadHref: string;
  nutSrc: string;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const close = () => {
    setOpen(false);
    setAcknowledged(false);
  };
  const ref = useDialog(open, close);

  const toggle = (n: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const allPicked = picked.size === fixes.length;
  const href = picked.size ? `${downloadHref}?fixes=${[...picked].sort((a, b) => a - b).join(",")}` : null;
  const viewSrc = `/api/preview/${materialId}?fixes=all`;

  return (
    <>
      <button type="button" className="mtc-row" data-tip={FIX_TIPS.view} onClick={() => setOpen(true)}>
        <Nut src={nutSrc} />
        <span>לצפייה בשינויים שכבר נעשו</span>
      </button>
      <dialog
        ref={ref}
        className={`fix-dialog ${acknowledged ? "fix-dialog-wide" : ""}`}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="fix-dialog-box">
          <div className="fix-dialog-head">
            <h3>{acknowledged ? "השינויים שכבר נעשו בקובץ" : "לפני שממשיכות"}</h3>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={close}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {!acknowledged ? (
            <div className="fix-gate">
              <FixNotice />
              <button type="button" className="btn btn-primary text-sm py-2" onClick={() => setAcknowledged(true)}>
                הבנתי, להמשיך
              </button>
            </div>
          ) : (
            <div className="fix-viewer">
              <div className="fix-pane">
                <p className="fix-dialog-sub">
                  סמני וי ליד כל שינוי שאת רוצה. במקום שלא סימנת יישאר הטקסט המקורי.
                </p>
                <ul className="fix-list">
                  {fixes.map((f) => (
                    <li key={f.number}>
                      <label className="fix-row">
                        <input type="checkbox" checked={picked.has(f.number)} onChange={() => toggle(f.number)} />
                        <span className="fix-num">{f.number}</span>
                        <span className="fix-texts">
                          <span className="fix-pink">{f.originalText}</span>
                          <span className="fix-arrow" aria-hidden>←</span>
                          <span className="fix-blue">{f.correctedText}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="fix-actions">
                  <button
                    type="button"
                    className="btn btn-ghost text-sm py-2"
                    onClick={() => setPicked(allPicked ? new Set() : new Set(fixes.map((f) => f.number)))}
                  >
                    {allPicked ? "ניקוי הסימונים" : "סימון הכול"}
                  </button>
                  {href ? (
                    <a href={href} className="btn btn-primary text-sm py-2" onClick={close}>
                      הורדה עם {picked.size} {picked.size === 1 ? "שינוי" : "שינויים"}
                    </a>
                  ) : (
                    <span className="btn btn-primary text-sm py-2 fix-disabled" aria-disabled>
                      סמני לפחות שינוי אחד
                    </span>
                  )}
                </div>
              </div>
              <div className="fix-frame-wrap">
                <p className="fix-legend">
                  <span className="fix-pink">מה שהתבקש לתקן</span>
                  <span className="fix-blue">התיקון</span>
                  <a href={viewSrc} target="_blank" rel="noopener noreferrer" className="underline">
                    פתיחה בלשונית חדשה
                  </a>
                </p>
                <iframe src={viewSrc} title="הקובץ עם השינויים" className="fix-frame" />
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
