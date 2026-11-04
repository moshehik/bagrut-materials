"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Download, MessageSquareWarning, Plus, Send, Sparkles, X } from "lucide-react";
import {
  cancelOwnFix,
  submitFixRequests,
  resolveMark,
  submitGeneralComplaint,
  suggestFixWithAI,
  type FixState,
} from "@/lib/actions/fixes";
import { FIX_REASONS, type FixReasonKey } from "@/lib/fix-writing-guidelines";
import { PdfViewer, type PdfMark } from "@/components/pdf-viewer";

/** own = התיקון של המורה עצמה: חל אצלה מיד (מסומן מראש), בלי תלות בהחלטה על שאר המורות */
export type CardFix = { id?: number; number: number; originalText: string; correctedText: string; own?: boolean };

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
function useDialog(open: boolean, onClose: () => void, modal = true) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // במצב הדגמה (סיור באתר) החלון נפתח בלי שכבת "מודאלי", כדי שכרטיס הסיור יישאר לחיץ מעליו
    if (open && !d.open) (modal ? d.showModal() : d.show());
    if (!open && d.open) d.close();
  }, [open, modal]);
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

/** free = המורה כותבת את התיקון; list = בוחרת סיבה מרשימה; custom = מתארת בחופשיות מה לא טוב (בשתיהן ג'מיני מנסח) */
type EditMode = "free" | "list" | "custom";
type Edit = {
  id: number;
  quote: string;
  correction: string;
  mark: PdfMark | null;
  applied: boolean;
  mode: EditMode;
  reason: FixReasonKey | null;
  note: string;
  busy: boolean;
  aiError: string | null;
  /** המופע בקובץ, כפי שזוהה בשרת (גובר על מה שהסימון ב-PDF מדווח) */
  occ?: number;
  /** זיהוי הסימון בקובץ: busy = בבדיקה, ok = נמצא כמו שסומן, fixed = הותאם לטקסט שבקובץ, fail = לא זוהה */
  check: "idle" | "busy" | "ok" | "fixed" | "fail";
  checkMsg: string | null;
};
let editSeq = 0;
const newEdit = (): Edit => ({
  id: ++editSeq,
  quote: "",
  correction: "",
  mark: null,
  applied: false,
  mode: "free",
  reason: null,
  note: "",
  busy: false,
  aiError: null,
  check: "idle",
  checkMsg: null,
});

const MODE_LABELS: { mode: EditMode; label: string }[] = [
  { mode: "free", label: "אני כותבת את התיקון" },
  { mode: "list", label: "בחירה מרשימה" },
  { mode: "custom", label: "ניסוח חופשי של הבעיה" },
];

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
  demo = false,
}: {
  materialId: number;
  materialTitle: string;
  /** הדגמה לסיור באתר: שום דבר לא נשלח לשרת, והתיקון "חל" רק על המסך */
  demo?: boolean;
  /** אם אין גישה לקובץ – לאן לשלוח במקום לפתוח את החלון (התחברות / רכישה) */
  lockedHref?: string | null;
  nutSrc: string;
  /** רק לדוגמאות פיתוח: קובץ PDF קבוע להצגה במקום הצפייה האמיתית */
  viewSrc?: string;
}) {
  const [open, setOpen] = useState(false);
  // בהדגמה (סיור) החלון נשתל ישירות ב-body, כדי שיהיה מרוכז במסך ולא יושפע מהמיכל שהכרטיסייה בתוכו
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [acknowledged, setAcknowledged] = useState(false);
  const [edits, setEdits] = useState<Edit[]>(() => [newEdit()]);
  const [activeId, setActiveId] = useState<number>(() => edits[0].id);
  const [result, setResult] = useState<FixState>(undefined);
  const [pending, startSend] = useTransition();
  const router = useRouter();
  // אחרי שליחה מוצלחת מאפסים את החלון (אחרת הוא נשאר על "הבקשה נשלחה" ואי אפשר להוסיף תיקונים נוספים)
  const resetAfterSend = () => {
    const e = newEdit();
    setEdits([e]);
    setActiveId(e.id);
    setResult(undefined);
  };
  // תלונה כללית על הקובץ (בלי טקסט מסומן)
  const [generalOpen, setGeneralOpen] = useState(false);
  const [generalText, setGeneralText] = useState("");
  const [generalResult, setGeneralResult] = useState<FixState>(undefined);
  const [generalPending, startGeneral] = useTransition();
  const sendGeneral = () => {
    setGeneralResult(undefined);
    startGeneral(async () => {
      const res = await submitGeneralComplaint({ materialId, text: generalText });
      setGeneralResult(res);
      if (res?.ok) setGeneralText("");
    });
  };
  const close = () => {
    setOpen(false);
    setAcknowledged(false);
    if (result?.ok) resetAfterSend();
    setGeneralOpen(false);
    setGeneralResult(undefined);
  };
  const ref = useDialog(open, close, !demo);

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
    update(target.id, { mark, quote: mark.text, occ: undefined, check: demo ? "idle" : "busy", checkMsg: null });
    if (!demo) verifyMark(target.id, mark.text, mark.occurrence);
  };
  /** מזהה בשרת את הטקסט שסומן בקובץ (גם כשהוא לא זהה בדיוק) ומציג למורה מה זוהה, עוד לפני שהיא כותבת תיקון */
  const verifyMark = async (id: number, text: string, occurrence?: number) => {
    try {
      const res = await resolveMark({ materialId, quote: text, occurrence });
      setEdits((list) =>
        list.map((e) => {
          if (e.id !== id || e.quote !== text) return e; // הסימון הוחלף/נערך בינתיים
          if (res.error) return { ...e, check: "fail", checkMsg: res.error };
          if (res.skipped || !res.quote) return { ...e, check: "idle", checkMsg: null };
          if (res.exact) return { ...e, check: "ok", checkMsg: null, occ: res.occurrence };
          return {
            ...e,
            quote: res.quote,
            occ: res.occurrence,
            check: "fixed",
            checkMsg: "הטקסט ב-PDF לא זהה בדיוק לקובץ, אז התאמנו את הסימון לטקסט כפי שהוא כתוב בקובץ. בדקי שזה הקטע הנכון.",
          };
        }),
      );
    } catch {
      setEdits((list) => list.map((e) => (e.id === id && e.check === "busy" ? { ...e, check: "idle" } : e)));
    }
  };

  const marks = edits.flatMap((e) => (e.mark ? [e.mark] : []));
  const active = edits.find((e) => e.id === activeId);
  const canApply = !!active && !active.applied && active.quote.trim().length >= 2 && active.correction.trim().length > 0;
  const applyActive = () => {
    if (active) update(active.id, { applied: true });
  };
  const ready = edits.filter((e) => e.quote.trim().length >= 2 && e.correction.trim());
  /** המופע שסומן (כשהטקסט חוזר כמה פעמים) – רק אם הטקסט לא נערך ידנית אחרי הסימון */
  const occurrenceOf = (e: Edit) => (e.occ !== undefined ? e.occ : e.mark && e.mark.text === e.quote ? e.mark.occurrence : undefined);
  /** ג'מיני מנסח תיקון לפי הסיבה/התיאור; התיקון נכנס לתיבת "התיקון שלך" וניתן לעריכה */
  const askAI = async (e: Edit) => {
    update(e.id, { busy: true, aiError: null });
    try {
      const res = await suggestFixWithAI({
        materialId,
        quote: e.quote.trim(),
        occurrence: occurrenceOf(e),
        reason: e.mode === "list" ? (e.reason ?? undefined) : undefined,
        note: e.mode === "custom" ? e.note.trim() || undefined : undefined,
      });
      update(e.id, res.correction ? { busy: false, correction: res.correction } : { busy: false, aiError: res.error ?? "לא הצלחנו להכין תיקון" });
    } catch {
      update(e.id, { busy: false, aiError: "לא הצלחנו להכין תיקון כרגע. נסי שוב." });
    }
  };
  const send = () => {
    setResult(undefined);
    if (demo) {
      startSend(async () => {
        await new Promise((r) => setTimeout(r, 700));
        setResult({ ok: true } as FixState);
        window.dispatchEvent(new Event("tour-fix-applied"));
      });
      return;
    }
    startSend(async () => {
      const res = await submitFixRequests({
        materialId,
        items: ready.map((e) => ({
          quote: e.quote.trim(),
          correction: e.correction.trim(),
          occurrence: occurrenceOf(e),
          source: e.mode,
          reason: e.mode === "list" ? (e.reason ?? undefined) : undefined,
          note: e.mode === "custom" ? e.note.trim() || undefined : undefined,
        })),
      });
      setResult(res);
      // התיקון חל אצלה מיד – מרעננים כדי ש"לצפייה בשינויים"/"להורדת הקובץ המתוקן" יופיעו בכרטיסייה
      if (res?.ok) router.refresh();
    });
  };
  const viewSrc = viewSrcOverride ?? `/api/preview/${materialId}`;

  const label = (
    <>
      <Nut src={nutSrc} />
      <span>לעריכת שינויים בקובץ</span>
    </>
  );

  const dialogEl = (
    <dialog
      ref={ref}
      className={`fix-dialog fix-dialog-dark ${acknowledged ? "fix-dialog-wide" : ""} ${demo ? "fix-dialog-demo" : ""}`}
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
              התיקון כבר חל אצלך! בכרטיסייה מופיעות עכשיו האפשרויות &quot;לצפייה בשינויים שכבר נעשו&quot; ו
              &quot;להורדת הקובץ המתוקן&quot;. בנפרד, נבדוק אם לעדכן את הקובץ גם אצל שאר המורות.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-gold text-sm py-2" onClick={resetAfterSend}>
                הוספת תיקון נוסף
              </button>
              <button type="button" className="btn text-sm py-2" onClick={close}>
                סגירה
              </button>
            </div>
          </div>
        ) : (
          <div className="fix-inner fix-viewer">
            <div className="fix-pane">
              <p className="fix-dialog-sub">
                סמני בקובץ את הטקסט שצריך תיקון ולחצי &quot;סימון לתיקון&quot;, ואז כתבי מתחת את התיקון שלך. אפשר גם לבחור
                סיבה מרשימה או לתאר מה לא טוב, ונכין לך תיקון.
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
                        onChange={(ev) => update(e.id, { quote: ev.target.value, mark: null, occ: undefined, check: "idle", checkMsg: null })}
                      />
                    </label>
                    {e.check === "busy" && <p className="fix-check">בודקת איפה זה בקובץ…</p>}
                    {e.check === "fixed" && e.checkMsg && <p className="fix-check fix-check-fixed">{e.checkMsg}</p>}
                    {e.check === "fail" && e.checkMsg && <p className="fix-error">{e.checkMsg}</p>}
                    {!demo && (
                      <div className="fix-modes" role="tablist" aria-label="איך לתקן">
                        {MODE_LABELS.map((m) => (
                          <button
                            key={m.mode}
                            type="button"
                            role="tab"
                            aria-selected={e.mode === m.mode}
                            className={`fix-mode ${e.mode === m.mode ? "fix-mode-on" : ""}`}
                            onClick={() => update(e.id, { mode: m.mode, aiError: null })}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {e.mode === "list" && (
                      <div className="fix-ai">
                        <div className="fix-reasons" role="radiogroup" aria-label="מה הבעיה">
                          {FIX_REASONS.map((r) => (
                            <label key={r.key} className="fix-reason">
                              <input
                                type="radio"
                                name={`fix-reason-${e.id}`}
                                checked={e.reason === r.key}
                                onChange={() => update(e.id, { reason: r.key, aiError: null })}
                              />
                              <span>{r.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {e.mode === "custom" && (
                      <div className="fix-ai">
                        <label>
                          מה לא טוב בקטע שסימנת?
                          <textarea
                            rows={2}
                            maxLength={1000}
                            value={e.note}
                            placeholder="למשל: הניסוח לא ברור לתלמידה, או שחסר כאן הסבר…"
                            onFocus={() => setActiveId(e.id)}
                            onChange={(ev) => update(e.id, { note: ev.target.value, aiError: null })}
                          />
                        </label>
                      </div>
                    )}
                    {e.mode !== "free" && (
                      <div className="fix-ai">
                        <button
                          type="button"
                          className="fix-ai-btn"
                          disabled={
                            e.busy ||
                            e.quote.trim().length < 2 ||
                            (e.mode === "list" ? !e.reason : e.note.trim().length < 3)
                          }
                          onClick={() => askAI(e)}
                        >
                          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          {e.busy ? "מכינה תיקון…" : e.correction.trim() ? "הכנת תיקון אחר" : "הכנת תיקון"}
                        </button>
                        {e.aiError && <p className="fix-error">{e.aiError}</p>}
                      </div>
                    )}
                    <label>
                      {e.mode === "free" ? "התיקון שלך" : "התיקון שהוכן (אפשר לערוך)"}
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
              {!demo && (
                <div className="fix-general">
                  <button type="button" className="fix-add" onClick={() => setGeneralOpen((v) => !v)} aria-expanded={generalOpen}>
                    <MessageSquareWarning className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    תלונה כללית על הקובץ (בלי סימון)
                  </button>
                  {generalOpen &&
                    (generalResult?.ok ? (
                      <p className="fix-dialog-sub">התלונה נשלחה, תודה! נבדוק אותה ונתקן בקובץ אם יתברר שצריך.</p>
                    ) : (
                      <div className="fix-general-box">
                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={generalText}
                          placeholder="כתבי מה לא טוב בקובץ בכלל, בלי לסמן קטע מסוים"
                          onChange={(ev) => setGeneralText(ev.target.value)}
                        />
                        {generalResult?.error && <p className="fix-error">{generalResult.error}</p>}
                        <button
                          type="button"
                          className="btn btn-gold text-sm py-2"
                          disabled={generalPending || generalText.trim().length < 5}
                          onClick={sendGeneral}
                        >
                          {generalPending ? "שולחת…" : "שליחת התלונה"}
                        </button>
                      </div>
                    ))}
                </div>
              )}
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
      {demo ? (mounted ? createPortal(dialogEl, document.body) : null) : dialogEl}
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
  // התיקונים של המורה עצמה מסומנים מראש (חלים אצלה מיד); של אחרות – היא בוחרת
  const [picked, setPicked] = useState<Set<number>>(() => new Set(fixes.filter((f) => f.own).map((f) => f.number)));
  const close = () => {
    setOpen(false);
    setAcknowledged(false);
  };
  const ref = useDialog(open, close);
  const router = useRouter();
  const [cancelling, startCancel] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);
  /** ביטול תיקון שהמורה עצמה ביקשה (מוסתר מהצפייה וההורדה שלה) */
  const cancelMine = (f: CardFix) => {
    if (!f.id) return;
    if (!window.confirm("לבטל את התיקון שלך? הוא יוסר מהצפייה ומההורדה שלך.")) return;
    setCancelError(null);
    startCancel(async () => {
      const res = await cancelOwnFix(f.id!);
      if (res?.error) setCancelError(res.error);
      else {
        setPicked((prev) => {
          const next = new Set(prev);
          next.delete(f.number);
          return next;
        });
        router.refresh();
      }
    });
  };

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
                      {f.own && f.id ? (
                        <button
                          type="button"
                          className="btn btn-ghost text-sm py-1"
                          disabled={cancelling}
                          onClick={() => cancelMine(f)}
                        >
                          ביטול התיקון שלי
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {cancelError ? <p className="fix-dialog-sub" role="alert">{cancelError}</p> : null}
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
