"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Check, Download, Plus, Send, X } from "lucide-react";
import { submitFixRequests, type FixState } from "@/lib/actions/fixes";
import { PdfViewer, type PdfMark } from "@/components/pdf-viewer";

export type CardFix = { number: number; originalText: string; correctedText: string };

/** נוסחי הטולטיפ של שלושת אגוזי התיקונים (כתב גברת לוין, מוצג במעבר עכבר / מיקוד) */
export const FIX_TIPS = {
  edit: "בעריכת שינויים – תוכלי לתקן טעויות",
  view: "לצפייה בשינויים – תוכלי לראות תיקונים שכבר נעשו ולסמן אם את מעוניינת בהם.",
  download: "להורדת הקובץ המתוקן: להורדת הדף עם השינויים.",
} as const;

/** ההודעה הצפה לפני שמורה מסמנת תיקונים */
function FixNotice() {
  return (
    <div className="fix-notice" role="note">
      <b>שימי לב!</b>
      <ol>
        <li>
          מערכת לו&quot;ז העניין עוברת על השינויים הנערכים.<br />אם יתברר שאכן חלה טעות היא תתוקן ותשולב בקובץ המקורי
          תוך מספר ימים.
        </li>
        <li>
          הסימונים שאת מסמנת וכן הצבע המודגש של הטעות ותיקונה מופיעים <strong className="fix-emph">רק בקובץ לצפייה</strong>.<br />כשתורידי אותו תקבלי אותו
          בנראות רגילה.
        </li>
      </ol>
    </div>
  );
}

/** תוכן שלב ההודעה "שימי לב!" – משותף לעריכת שינויים ולצפייה בשינויים (אותו עיצוב בכל מקום) */
function NoticeGate({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="fix-gate">
      <FixNotice />
      {/* לוגו האתר (הלבן, על הרקע הכחול) מתחת להודעה ומעל הלחצן */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/logo-white.png" alt="לו״ז העניין" width={1491} height={871} className="fix-gate-logo" />
      <button type="button" className="btn btn-gold text-sm py-2 fix-gate-btn" onClick={onContinue}>
        הבנתי, להמשיך
        <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
      </button>
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

type Edit = { id: number; quote: string; correction: string; mark: PdfMark | null; applied: boolean };
let editSeq = 0;
const newEdit = (): Edit => ({ id: ++editSeq, quote: "", correction: "", mark: null, applied: false });

/**
 * "לעריכת שינויים בקובץ": אחרי ההודעה "שימי לב!" נפתח הקובץ עצמו; המורה מסמנת בו את הטקסט שצריך
 * תיקון ("סימון לתיקון"), כותבת מתחת את התיקון שלה, ויכולה להוסיף עוד תיקונים. כל התיקונים נשלחים
 * יחד לטיפול המנהלת (ר' /admin/fixes).
 */
export function FixRequestButton({
  materialId,
  materialTitle,
  lockedHref,
  nutSrc,
  viewSrc: viewSrcOverride,
}: {
  materialId: number;
  materialTitle: string;
  /** אם אין גישה לקובץ – לאן לשלוח במקום לפתוח את החלון (התחברות / רכישה) */
  lockedHref?: string | null;
  nutSrc: string;
  /** רק לדוגמאות פיתוח: קובץ PDF קבוע להצגה במקום הצפייה האמיתית */
  viewSrc?: string;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [edits, setEdits] = useState<Edit[]>(() => [newEdit()]);
  const [activeId, setActiveId] = useState<number>(() => edits[0].id);
  const [result, setResult] = useState<FixState>(undefined);
  const [pending, startSend] = useTransition();
  const close = () => {
    setOpen(false);
    setAcknowledged(false);
  };
  const ref = useDialog(open, close);

  const update = (id: number, patch: Partial<Edit>) =>
    setEdits((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const addEdit = () => {
    const e = newEdit();
    setEdits((list) => [...list, e]);
    setActiveId(e.id);
  };
  const removeEdit = (id: number) =>
    setEdits((list) => {
      const rest = list.filter((e) => e.id !== id);
      if (rest.length === 0) {
        const e = newEdit();
        setActiveId(e.id);
        return [e];
      }
      if (id === activeId) setActiveId(rest[rest.length - 1].id);
      return rest;
    });
  const onMark = (mark: PdfMark) => {
    // אם התיקון הפעיל כבר לא קיים – הסימון נכנס לתיקון האחרון ברשימה
    const target = edits.find((e) => e.id === activeId) ?? edits[edits.length - 1];
    setActiveId(target.id);
    update(target.id, { mark, quote: mark.text });
  };

  const marks = edits.flatMap((e) => (e.mark ? [e.mark] : []));
  const active = edits.find((e) => e.id === activeId);
  const canApply = !!active && !active.applied && active.quote.trim().length >= 2 && active.correction.trim().length > 0;
  const applyActive = () => {
    if (active) update(active.id, { applied: true });
  };
  const ready = edits.filter((e) => e.quote.trim().length >= 2 && e.correction.trim());
  const send = () => {
    setResult(undefined);
    startSend(async () => {
      const res = await submitFixRequests({
        materialId,
        items: ready.map((e) => ({ quote: e.quote.trim(), correction: e.correction.trim() })),
      });
      setResult(res);
    });
  };
  const viewSrc = viewSrcOverride ?? `/api/preview/${materialId}`;

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
        className={`fix-dialog fix-dialog-dark ${acknowledged ? "fix-dialog-wide" : ""}`}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="fix-dialog-box">
          <div className={`fix-dialog-head ${acknowledged ? "fix-dialog-head-centered" : ""}`}>
            {acknowledged && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/images/logo-white.png" alt="לו״ז העניין" width={1491} height={871} className="fix-head-logo" />
            )}
            <div className="fix-head-title">
              <h3>{acknowledged ? "לעריכת שינויים בקובץ" : "לפני שממשיכות!"}</h3>
              {acknowledged && <p className="fix-dialog-sub">{materialTitle}</p>}
            </div>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={close}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {!acknowledged ? (
            <NoticeGate onContinue={() => setAcknowledged(true)} />
          ) : result?.ok ? (
            <div className="fix-inner fix-done">
              <p>
                הבקשה נשלחה. כשהשינוי יתווסף לקובץ יופיעו בכרטיסייה האפשרויות &quot;לצפייה בשינויים שכבר נעשו&quot; ו
                &quot;להורדת הקובץ המתוקן&quot;.
              </p>
              <button type="button" className="btn btn-gold text-sm py-2" onClick={close}>
                סגירה
              </button>
            </div>
          ) : (
            <div className="fix-inner fix-viewer">
              <div className="fix-pane">
                <p className="fix-dialog-sub">
                  סמני בקובץ את הטקסט שצריך תיקון ולחצי &quot;סימון לתיקון&quot;, ואז כתבי מתחת את התיקון שלך.
                </p>
                <ul className="fix-edits">
                  {edits.map((e, i) => (
                    <li
                      key={e.id}
                      className={`fix-edit ${e.id === activeId ? "fix-edit-active" : ""}`}
                      onClick={() => setActiveId(e.id)}
                    >
                      <div className="fix-edit-head">
                        <span className="fix-num">{i + 1}</span>
                        <button
                          type="button"
                          className="fix-edit-remove"
                          aria-label="הסרת התיקון"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            removeEdit(e.id);
                          }}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      {e.applied ? (
                        <div className="fix-edit-applied">
                          <span className="fix-pink">{e.quote}</span>
                          <span className="fix-arrow" aria-hidden>←</span>
                          <span className="fix-blue">{e.correction}</span>
                          <button
                            type="button"
                            className="fix-edit-reopen"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              update(e.id, { applied: false });
                              setActiveId(e.id);
                            }}
                          >
                            עריכה
                          </button>
                        </div>
                      ) : (
                        <>
                      <label>
                        מה שצריך תיקון (מסמנים בקובץ)
                        <textarea
                          className="fix-edit-quote"
                          rows={2}
                          maxLength={1000}
                          value={e.quote}
                          placeholder="סמני בקובץ את הטעות…"
                          onFocus={() => setActiveId(e.id)}
                          onChange={(ev) => update(e.id, { quote: ev.target.value, mark: null })}
                        />
                      </label>
                      <label>
                        התיקון שלך
                        <textarea
                          className="fix-edit-fix"
                          rows={2}
                          maxLength={2000}
                          value={e.correction}
                          placeholder="כתבי כאן איך זה צריך להיות"
                          onFocus={() => setActiveId(e.id)}
                          onChange={(ev) => update(e.id, { correction: ev.target.value })}
                        />
                      </label>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {active && !active.applied && (
                  <button type="button" className="fix-apply" disabled={!canApply} onClick={applyActive}>
                    <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                    החל תיקון
                  </button>
                )}
                <button type="button" className="fix-add" onClick={addEdit}>
                  <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  הוספת תיקון נוסף
                </button>
                {result?.error && <p className="fix-error">{result.error}</p>}
                <div className="fix-actions">
                  <button
                    type="button"
                    disabled={pending || ready.length === 0}
                    className="btn btn-gold text-sm py-2 fix-gate-btn"
                    onClick={send}
                  >
                    {pending ? "שולחת…" : ready.length > 1 ? `שליחת ${ready.length} התיקונים` : "שליחת התיקון"}
                    <Send className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
                  </button>
                </div>
              </div>
              <div className="fix-frame-wrap">
                <p className="fix-legend">
                  <span className="fix-pink">מה שצריך תיקון</span>
                  <span className="fix-blue">התיקון</span>
                </p>
                {open && <PdfViewer src={viewSrc} className="fix-frame" selectable marks={marks} onMark={onMark} />}
              </div>
            </div>
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
  viewSrc: viewSrcOverride,
}: {
  materialId: number;
  fixes: CardFix[];
  /** כתובת ההורדה הבסיסית (בלי ?fixes) */
  downloadHref: string;
  nutSrc: string;
  /** רק לדוגמאות פיתוח: קובץ PDF קבוע להצגה במקום הצפייה האמיתית */
  viewSrc?: string;
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
  const viewSrc = viewSrcOverride ?? `/api/preview/${materialId}?fixes=all`;

  return (
    <>
      <button type="button" className="mtc-row" data-tip={FIX_TIPS.view} onClick={() => setOpen(true)}>
        <Nut src={nutSrc} />
        <span>לצפייה בשינויים שכבר נעשו</span>
      </button>
      <dialog
        ref={ref}
        className={`fix-dialog fix-dialog-dark ${acknowledged ? "fix-dialog-wide" : ""}`}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="fix-dialog-box">
          <div className={`fix-dialog-head ${acknowledged ? "fix-dialog-head-centered" : ""}`}>
            {acknowledged && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/images/logo-white.png" alt="לו״ז העניין" width={1491} height={871} className="fix-head-logo" />
            )}
            <div className="fix-head-title">
              <h3>{acknowledged ? "השינויים שכבר נעשו בקובץ" : "לפני שממשיכות!"}</h3>
            </div>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={close}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {!acknowledged ? (
            <NoticeGate onContinue={() => setAcknowledged(true)} />
          ) : (
            <div className="fix-inner fix-viewer">
              <div className="fix-pane">
                <p className="fix-dialog-sub">
                  סמני וי ליד כל שינוי שאת רוצה. במקום שלא סימנת יישאר הטקסט המקורי.
                </p>
                <ul className="fix-list">
                  {fixes.map((f) => (
                    <li key={f.number}>
                      <label className="fix-row">
                        <input type="checkbox" checked={picked.has(f.number)} onChange={() => toggle(f.number)} />
                        <span className="fix-check" aria-hidden />
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
                    <a href={href} className="btn btn-gold text-sm py-2 fix-gate-btn" onClick={close}>
                      הורדה עם {picked.size} {picked.size === 1 ? "שינוי" : "שינויים"}
                      <Download className="h-4 w-4 fix-gate-arrow fix-gate-down" strokeWidth={1.75} aria-hidden />
                    </a>
                  ) : (
                    <span className="btn btn-gold text-sm py-2 fix-gate-btn fix-disabled" aria-disabled>
                      סמני לפחות שינוי אחד
                      <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                  )}
                </div>
              </div>
              <div className="fix-frame-wrap">
                <p className="fix-legend">
                  <span className="fix-pink">מה שהתבקש לתקן</span>
                  <span className="fix-blue">התיקון</span>
                </p>
                <PdfViewer src={viewSrc} className="fix-frame" />
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
