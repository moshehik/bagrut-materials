"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Download, MessageSquareWarning, Plus, Sparkles, X } from "lucide-react";
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
import { encodeDraft } from "@/lib/fix-draft";

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

/** התשובה ל"איך תרצי לתקן?": "" = עוד לא נבחר; self = היא כותבת את התיקון; אחרת סיבה מהרשימה, וג'מיני מנסח הצעה */
type FixChoice = "" | "self" | FixReasonKey;
type Edit = {
  id: number;
  quote: string;
  correction: string;
  mark: PdfMark | null;
  applied: boolean;
  choice: FixChoice;
  note: string;
  busy: boolean;
  aiError: string | null;
  /** נשלח עכשיו לשרת ("החל תיקון" בהמתנה) */
  submitting: boolean;
  /** שגיאה מהשרת על התיקון הזה (למשל: הטקסט לא נמצא בקובץ) – התיקון נשאר פתוח לעריכה */
  submitError: string | null;
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
  choice: "",
  note: "",
  busy: false,
  aiError: null,
  submitting: false,
  submitError: null,
  check: "idle",
  checkMsg: null,
});

/** הסיבה שנבחרה ברשימה (אם נבחרה סיבה ולא "אני אתקן בעצמי") */
const reasonOf = (choice: FixChoice): FixReasonKey | undefined => (choice === "" || choice === "self" ? undefined : choice);

/**
 * "איך תרצי לתקן?": רשימה נפתחת בעיצוב האתר (במקום select של הדפדפן, שאי אפשר לעצב).
 * הרשימה נפתחת בתוך הזרימה ולא מעל התוכן, כדי שלא תיחתך באזור הנגלל.
 */
function FixHowSelect({
  value,
  onChange,
  onOpen,
  labelledBy,
}: {
  value: FixChoice;
  onChange: (v: FixChoice) => void;
  onOpen: () => void;
  labelledBy: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    list.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const away = (ev: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const pick = (v: FixChoice) => {
    onChange(v);
    setOpen(false);
  };
  const current = value === "self" ? "אני אתקן בעצמי" : FIX_REASONS.find((r) => r.key === value)?.label;
  const option = (v: FixChoice, text: string) => (
    <li key={v} role="presentation">
      <button type="button" role="option" aria-selected={value === v} className="fix-opt" onClick={() => pick(v)}>
        <span>{text}</span>
        {value === v && <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
      </button>
    </li>
  );
  return (
    <div
      className="fix-how"
      ref={wrap}
      onKeyDown={(ev) => {
        if (ev.key === "Escape" && open) {
          ev.preventDefault(); // בלי זה Escape סוגר את כל החלון
          ev.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={`fix-how-btn ${open ? "fix-how-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        onClick={() => {
          onOpen();
          setOpen((v) => !v);
        }}
      >
        <span className={current ? "" : "fix-how-ph"}>{current ?? "בחרי…"}</span>
        <ChevronDown className="h-5 w-5 fix-how-chev" strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <ul className="fix-how-list" role="listbox" aria-labelledby={labelledBy} ref={list}>
          {option("self", "אני אתקן בעצמי")}
          <li role="presentation" className="fix-how-group">
            או שנציע לך תיקון. מה הבעיה בקטע?
          </li>
          {FIX_REASONS.map((r) => option(r.key, r.label))}
        </ul>
      )}
    </div>
  );
}

/** מה נשלח לשרת: כתיבה עצמית = free; סיבה בלבד = list; סיבה + הערה = custom */
const aiPayload = (e: { choice: FixChoice; note: string }) => {
  const reason = reasonOf(e.choice);
  if (!reason) return { source: "free" as const };
  const note = e.note.trim();
  if (!note) return { source: "list" as const, reason };
  const reasonLabel = FIX_REASONS.find((r) => r.key === reason)?.label;
  return { source: "custom" as const, note: reasonLabel ? `${reasonLabel}: ${note}` : note };
};

/**
 * "לעריכת שינויים בקובץ": נפתח הקובץ עצמו; המורה מסמנת בו את הטקסט שצריך תיקון ("סימון לתיקון"),
 * כותבת מתחת את התיקון שלה (או מקבלת הצעה מג'מיני) ולוחצת "החל תיקון". כל תיקון נשלח מיד בלחיצה: הוא חל אצלה
 * מיד והחלון נשאר פתוח להמשך סימונים, ובנפרד נשמר לטיפול (המנהלת / הסוכן, ר' /admin/fixes).
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
  const [edits, setEdits] = useState<Edit[]>(() => [newEdit()]);
  const [activeId, setActiveId] = useState<number>(() => edits[0].id);
  /** עולה בכל תיקון שנשלח בהצלחה – טוען מחדש את הקובץ שבחלון כך שיציג את התיקון שחל */
  const [viewVersion, setViewVersion] = useState(0);
  /** הנוסח החדש שעוד לא נשלח (ידני או מג'מיני), בקידוד לתצוגה המקדימה – הקובץ שבצד נטען איתו מחדש כמו ב"לצפייה בשינויים" */
  const [liveDraft, setLiveDraft] = useState<string | null>(null);
  const router = useRouter();
  // תלונה כללית על הקובץ (בלי טקסט מסומן)
  const [generalOpen, setGeneralOpen] = useState(false);
  const [generalText, setGeneralText] = useState("");
  const [generalResult, setGeneralResult] = useState<FixState>(undefined);
  const [generalPending, startGeneral] = useTransition();
  /** אישור שליחת ההערה הכללית: חלונית צפה בעיצוב חלוניות האתר, ולא טקסט שנכנס בתוך החלון הגדול */
  const [generalDone, setGeneralDone] = useState(false);
  const generalDoneRef = useDialog(generalDone, () => setGeneralDone(false), true);
  const sendGeneral = () => {
    setGeneralResult(undefined);
    startGeneral(async () => {
      const res = await submitGeneralComplaint({ materialId, text: generalText });
      setGeneralResult(res);
      if (res?.ok) {
        setGeneralText("");
        setGeneralOpen(false);
        setGeneralDone(true);
      }
    });
  };
  const close = () => {
    setOpen(false);
    // תיקונים שכבר נשלחו מוסרים מהרשימה (הם חלים בקובץ ובכרטיסייה), כדי שהחלון ייפתח נקי בפעם הבאה
    const left = edits.filter((e) => !e.applied);
    if (left.length !== edits.length) {
      const next = left.length ? left : [newEdit()];
      setEdits(next);
      setActiveId(next[0].id);
    }
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

  // תיקון שכבר נשלח מופיע בקובץ המרוענן, אז לא מציירים שוב את הסימון שלו
  // וגם סימון שכבר מוצג בקובץ כהחלפה (תצוגה חיה) לא מצויר שוב
  const marks = edits.flatMap((e) => (e.mark && !e.applied && !(liveDraft && e.correction.trim()) ? [e.mark] : []));
  const canApplyEdit = (e: Edit) =>
    !e.applied && !e.submitting && !e.busy && e.check !== "busy" && e.quote.trim().length >= 2 && e.correction.trim().length > 0;
  /** המופע שסומן (כשהטקסט חוזר כמה פעמים) – רק אם הטקסט לא נערך ידנית אחרי הסימון */
  const occurrenceOf = (e: Edit) => (e.occ !== undefined ? e.occ : e.mark && e.mark.text === e.quote ? e.mark.occurrence : undefined);
  // תצוגה חיה: אחרי שיש נוסח חדש (הקלדה, אחרי הפסקה קצרה, או הצעה מג'מיני) – הקובץ נטען מחדש עם ההחלפה
  const draftKey = demo
    ? null
    : encodeDraft(edits.filter((e) => !e.applied).map((e) => ({ q: e.quote, c: e.correction, o: occurrenceOf(e) })));
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setLiveDraft(draftKey), draftKey ? 700 : 0);
    return () => clearTimeout(t);
  }, [draftKey, open]);
  /** ג'מיני מנסח תיקון לפי הסיבה/התיאור; התיקון נכנס לתיבת "התיקון שלך" וניתן לעריכה */
  const askAI = async (e: Edit) => {
    update(e.id, { busy: true, aiError: null });
    try {
      const res = await suggestFixWithAI({
        materialId,
        quote: e.quote.trim(),
        occurrence: occurrenceOf(e),
        reason: reasonOf(e.choice),
        note: e.note.trim() || undefined,
      });
      update(e.id, res.correction ? { busy: false, correction: res.correction } : { busy: false, aiError: res.error ?? "לא הצלחנו להכין תיקון" });
    } catch {
      update(e.id, { busy: false, aiError: "לא הצלחנו להכין תיקון כרגע. נסי שוב." });
    }
  };
  /** "החל תיקון": שולח את התיקון הזה מיד. הצלחה → חל אצלה, הכרטיסייה והקובץ שבחלון מתרעננים; כשל → נשאר פתוח לעריכה */
  const applyEdit = async (e: Edit) => {
    if (!canApplyEdit(e)) return;
    update(e.id, { submitting: true, submitError: null });
    if (demo) {
      await new Promise((r) => setTimeout(r, 700));
      update(e.id, { submitting: false, applied: true });
      window.dispatchEvent(new Event("tour-fix-applied"));
      return;
    }
    try {
      const res = await submitFixRequests({
        materialId,
        items: [{ quote: e.quote.trim(), correction: e.correction.trim(), occurrence: occurrenceOf(e), ...aiPayload(e) }],
      });
      if (res?.ok) {
        update(e.id, { submitting: false, applied: true });
        setViewVersion((v) => v + 1);
        // התיקון חל אצלה מיד – מרעננים כדי ש"לצפייה בשינויים"/"להורדת הקובץ המתוקן" יופיעו בכרטיסייה
        router.refresh();
      } else {
        update(e.id, { submitting: false, submitError: res?.error ?? "לא הצלחנו לשלוח את התיקון. נסי שוב." });
      }
    } catch {
      update(e.id, { submitting: false, submitError: "לא הצלחנו לשלוח את התיקון כרגע. נסי שוב." });
    }
  };
  // אחרי תיקון שנשלח הקובץ שבחלון נטען מחדש עם התיקונים שחלים עליה (?fixes=all); הפרמטר v מונע שימוש בעותק ישן
  const viewSrc =
    viewSrcOverride ??
    (liveDraft
      ? `/api/preview/${materialId}?fixes=all&draft=${liveDraft}&v=${viewVersion}`
      : viewVersion > 0
        ? `/api/preview/${materialId}?fixes=all&v=${viewVersion}`
        : `/api/preview/${materialId}`);

  const label = (
    <>
      <Nut src={nutSrc} />
      <span>לעריכת שינויים בקובץ</span>
    </>
  );

  const dialogEl = (
    <dialog
      ref={ref}
      className={`fix-dialog fix-dialog-dark fix-dialog-wide ${demo ? "fix-dialog-demo" : ""}`}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="fix-dialog-box">
        <div className="fix-dialog-head fix-dialog-head-centered">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-white.png" alt="לו״ז העניין" width={1491} height={871} className="fix-head-logo" />
          <div className="fix-head-title">
            <h3>לעריכת שינויים בקובץ</h3>
            <p className="fix-dialog-sub">{materialTitle}</p>
          </div>
          <button type="button" className="fix-close" aria-label="סגירה" onClick={close}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {(
          <div className="fix-inner fix-viewer fix-viewer-edit">
            <div className="fix-pane">
              <div className="fix-pane-scroll">
              <p className="fix-dialog-sub">
                סמני בקובץ (משמאל) את הטקסט שצריך תיקון ולחצי &quot;סימון לתיקון&quot;, ואז ענִי על השאלה למטה.
              </p>
              <ul className="fix-edits">
                {edits.map((e, i) => {
                  const reason = reasonOf(e.choice);
                  // תיבת התיקון מופיעה רק כשהיא כותבת בעצמה, או אחרי שהוכנה לה הצעה לעריכה
                  const showCorrection = demo || e.choice === "self" || (!!reason && !!e.correction.trim());
                  return (
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
                          <span className="fix-edit-done">
                            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                            חל אצלך
                          </span>
                        </div>
                      ) : (
                        <>
                          <label className="fix-q">
                            מה שצריך תיקון
                            <textarea
                              className="fix-edit-quote"
                              rows={2}
                              maxLength={1000}
                              value={e.quote}
                              placeholder="עוד לא סימנת. סמני בקובץ משמאל…"
                              onFocus={() => setActiveId(e.id)}
                              onChange={(ev) => update(e.id, { quote: ev.target.value, mark: null, occ: undefined, check: "idle", checkMsg: null })}
                            />
                          </label>
                          {e.check === "busy" && <p className="fix-check">בודקת איפה זה בקובץ…</p>}
                          {e.check === "fixed" && e.checkMsg && <p className="fix-check fix-check-fixed">{e.checkMsg}</p>}
                          {e.check === "fail" && e.checkMsg && <p className="fix-error">{e.checkMsg}</p>}

                          {!demo && (
                            <div className="fix-q">
                              <span id={`fix-how-${e.id}`}>איך תרצי לתקן?</span>
                              <FixHowSelect
                                labelledBy={`fix-how-${e.id}`}
                                value={e.choice}
                                onOpen={() => setActiveId(e.id)}
                                onChange={(choice) => update(e.id, { choice, aiError: null })}
                              />
                            </div>
                          )}

                          {reason && (
                            <div className="fix-ai">
                              <textarea
                                rows={2}
                                maxLength={1000}
                                value={e.note}
                                placeholder="אפשר להוסיף כמה מילים משלך (לא חובה)"
                                onFocus={() => setActiveId(e.id)}
                                onChange={(ev) => update(e.id, { note: ev.target.value, aiError: null })}
                              />
                              <button
                                type="button"
                                className="fix-ai-btn"
                                disabled={e.busy || e.quote.trim().length < 2}
                                onClick={() => askAI(e)}
                              >
                                <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                                {e.busy ? "מכינה הצעה…" : e.correction.trim() ? "הצעה אחרת" : "הכנת הצעה"}
                              </button>
                              {e.aiError && <p className="fix-error">{e.aiError}</p>}
                            </div>
                          )}

                          {showCorrection && (
                            <label className="fix-q">
                              {reason ? "ההצעה (אפשר לערוך)" : "התיקון שלך"}
                              <textarea
                                className="fix-edit-fix"
                                rows={3}
                                maxLength={2000}
                                value={e.correction}
                                placeholder="כתבי כאן איך זה צריך להיות"
                                onFocus={() => setActiveId(e.id)}
                                onChange={(ev) => update(e.id, { correction: ev.target.value })}
                              />
                            </label>
                          )}

                          {e.submitError && <p className="fix-error">{e.submitError}</p>}
                          {e.id === activeId && (
                            <button type="button" className="fix-apply" disabled={!canApplyEdit(e)} onClick={() => applyEdit(e)}>
                              <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                              {e.submitting ? "מחילה…" : "החל תיקון"}
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="fix-add" onClick={addEdit}>
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                עוד תיקון בקובץ
              </button>
              {!demo && (
                <div className="fix-general">
                  <button type="button" className="fix-link" onClick={() => setGeneralOpen((v) => !v)} aria-expanded={generalOpen}>
                    <MessageSquareWarning className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    יש הערה כללית על הקובץ, בלי לסמן קטע?
                  </button>
                  {generalOpen && (
                      <div className="fix-general-box">
                        <p className="fix-dialog-sub">
                          למשל: הדף ארוך מדי, חסרה שאלה על…, שאלה 3 לא ברורה. המערכת תבדוק את ההערה מול הקובץ, ואם צריך – תתקן
                          את הקובץ ותציע לך כאן גרסה מתוקנת.
                        </p>
                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={generalText}
                          placeholder="כתבי מה לא טוב בקובץ בכלל"
                          onChange={(ev) => setGeneralText(ev.target.value)}
                        />
                        {generalResult?.error && <p className="fix-error">{generalResult.error}</p>}
                        <button
                          type="button"
                          className="btn btn-gold text-sm py-2"
                          disabled={generalPending || generalText.trim().length < 5}
                          onClick={sendGeneral}
                        >
                          {generalPending ? "שולחת…" : "שליחת ההערה"}
                        </button>
                      </div>
                  )}
                </div>
              )}
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
      {/* אישור שליחת ההערה הכללית – אותה חלונית צפה כמו שאר החלוניות באתר */}
      <dialog
        ref={generalDoneRef}
        className="fix-dialog fix-dialog-dark"
        aria-label="ההערה נשלחה"
        onClick={(e) => {
          if (e.target === generalDoneRef.current) setGeneralDone(false);
        }}
      >
        <div className="fix-dialog-box">
          <div className="fix-dialog-head">
            <h3>ההערה נשלחה</h3>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={() => setGeneralDone(false)}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="fix-inner fix-done">
            <p className="fix-dialog-sub">תודה! נבדוק אותה, ואם צריך – תקבלי כאן קובץ מתוקן.</p>
          </div>
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
  // בצפייה בשינויים אין הודעת "לפני שממשיכות": ישר ברשימת השינויים והקובץ
  const acknowledged = true;
  // התיקונים של המורה עצמה מסומנים מראש (חלים אצלה מיד); של אחרות – היא בוחרת
  const [picked, setPicked] = useState<Set<number>>(() => new Set(fixes.filter((f) => f.own).map((f) => f.number)));
  const close = () => {
    setOpen(false);
  };
  const ref = useDialog(open, close);
  const router = useRouter();
  const [cancelling, startCancel] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);
  /** התיקון שמחכה לאישור הביטול בחלונית (במקום חלונית הדפדפן) */
  const [confirmCancel, setConfirmCancel] = useState<CardFix | null>(null);
  const confirmRef = useDialog(confirmCancel !== null, () => setConfirmCancel(null), true);
  /** ביטול תיקון שהמורה עצמה ביקשה (מוסתר מהצפייה וההורדה שלה) – אחרי אישור בחלונית */
  const cancelMine = (f: CardFix) => {
    if (!f.id) return;
    setConfirmCancel(null);
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

          {(

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
                          onClick={() => setConfirmCancel(f)}
                        >
                          ביטול התיקון שלי
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {cancelError ? <p className="fix-dialog-sub" role="alert">{cancelError}</p> : null}
                <div className="fix-actions">
                  {/* "סימון הכול / ניקוי הסימונים" רק כשיש יותר משינוי אחד */}
                  {fixes.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost text-sm py-2"
                      onClick={() => setPicked(allPicked ? new Set() : new Set(fixes.map((f) => f.number)))}
                    >
                      {allPicked ? "ניקוי הסימונים" : "סימון הכול"}
                    </button>
                  )}
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
      {/* אישור ביטול תיקון – חלונית צפה בעיצוב חלוניות האתר */}
      <dialog
        ref={confirmRef}
        className="fix-dialog fix-dialog-dark"
        aria-label="ביטול התיקון"
        onClick={(e) => {
          if (e.target === confirmRef.current) setConfirmCancel(null);
        }}
      >
        <div className="fix-dialog-box">
          <div className="fix-dialog-head">
            <h3>לבטל את התיקון שלך?</h3>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={() => setConfirmCancel(null)}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="fix-inner fix-done">
            <p className="fix-dialog-sub">הוא יוסר מהצפייה ומההורדה שלך.</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-gold text-sm py-2 fix-gate-btn"
                onClick={() => confirmCancel && cancelMine(confirmCancel)}
              >
                כן, לבטל
              </button>
              <button type="button" className="btn btn-ghost text-sm py-2" onClick={() => setConfirmCancel(null)}>
                לא, להשאיר
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
