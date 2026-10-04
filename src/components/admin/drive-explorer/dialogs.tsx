"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Archive, ChevronLeft, Folder, FolderPlus, History, LoaderCircle, Pencil, Search, TriangleAlert, MoveLeft, X, RefreshCw } from "lucide-react";
import { getHistory, type HistoryEntry } from "@/lib/actions/driveExplorer";
import {
  ancestorsOf,
  errMsg,
  eventText,
  fmtDate,
  NameWithExt,
  type TreeIndex,
} from "./shared";

/* ---------------------------------- מעטפת ---------------------------------- */

export function Modal({ title, icon, onClose, children, label }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label ?? title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dlg-box">
        <div className="dlg-h">
          {icon}
          <h3>{title}</h3>
          <button type="button" className="xbtn" onClick={onClose} aria-label="סגירה">
            <X className="ic" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** מריץ שליחה אסינכרונית: מחזיר [busy, error, submit]. שגיאה (מחרוזת) משאירה את הדיאלוג פתוח. */
function useSubmit(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(fn: () => Promise<string | null>) {
    setBusy(true);
    setErr(null);
    try {
      const e = await fn();
      if (e) setErr(e);
      else onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, err, submit };
}

function ErrNotice({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="notice err" role="alert">
      <TriangleAlert className="ic" aria-hidden />
      <div>{msg}</div>
    </div>
  );
}

const Spin = () => <LoaderCircle className="ic spin-ic" aria-hidden />;

/* ------------------------------ בחירת תיקיית יעד ------------------------------ */

export function MovePickerDialog(props: {
  title: string;
  subtitle: ReactNode;
  ix: TreeIndex;
  /** התיקייה הנוכחית (לא ניתנת לבחירה כיעד) */
  current?: number | null;
  /** מזהים שאסור לבחור (למשל תיקייה שמועברת וצאצאיה) */
  disabled?: Set<number>;
  disabledReason?: string;
  allowRoot?: boolean;
  submitLabel: string;
  onSubmit: (target: number | null) => Promise<string | null>;
  onClose: () => void;
}) {
  const { ix, current = null, disabled, allowRoot } = props;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null | undefined>(undefined);
  const [open, setOpen] = useState<Set<number>>(() => new Set(ancestorsOf(ix, current)));
  const { busy, err, submit } = useSubmit(props.onClose);

  const query = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return null;
    const v = new Set<number>();
    for (const n of ix.byId.values()) {
      if (n.title.toLowerCase().includes(query)) {
        v.add(n.id);
        ancestorsOf(ix, n.id).forEach((a) => v.add(a));
      }
    }
    return v;
  }, [ix, query]);

  function rows(parent: number | null, depth: number): ReactNode[] {
    const out: ReactNode[] = [];
    for (const n of ix.children.get(parent) ?? []) {
      if (visible && !visible.has(n.id)) continue;
      const kids = ix.children.get(n.id) ?? [];
      const expanded = visible ? true : open.has(n.id);
      const isDisabled = !!disabled?.has(n.id) || n.id === current;
      const reason = n.id === current ? "זו התיקייה הנוכחית" : props.disabledReason ?? "אי אפשר לבחור תיקייה זו";
      out.push(
        <button
          key={n.id}
          type="button"
          className={`prow ${sel === n.id ? "on" : ""}`}
          style={{ ["--d" as string]: depth }}
          disabled={isDisabled}
          title={isDisabled ? reason : undefined}
          aria-pressed={sel === n.id}
          onClick={() => setSel(n.id)}
        >
          <span
            className={`tog2 ${expanded ? "open" : ""} ${kids.length ? "" : "none"}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((s) => {
                const c = new Set(s);
                if (c.has(n.id)) c.delete(n.id);
                else c.add(n.id);
                return c;
              });
            }}
            aria-hidden
          >
            <ChevronLeft className="ic" />
          </span>
          <Folder className="ic" aria-hidden />
          <span>{n.title}</span>
          <span className="cnt">{n.total}</span>
          <span className="rad" />
        </button>,
      );
      if (expanded) out.push(...rows(n.id, depth + 1));
    }
    return out;
  }

  const target = sel === undefined ? null : sel === null ? "שורש (ללא תיקיית אב)" : ix.byId.get(sel)?.title ?? "";

  return (
    <Modal title={props.title} icon={<MoveLeft className="ic" aria-hidden />} onClose={props.onClose}>
      <p className="dlg-sub">{props.subtitle}</p>
      <div className="search" style={{ flex: "none", width: "100%" }}>
        <Search className="ic" aria-hidden />
        <input className="input" type="search" placeholder="חיפוש תיקייה…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש תיקיית יעד" autoFocus />
      </div>
      <div className="picker" role="group" aria-label="בחירת תיקיית יעד">
        {allowRoot && !query && (
          <button type="button" className={`prow ${sel === null ? "on" : ""}`} style={{ ["--d" as string]: 0 }} aria-pressed={sel === null} onClick={() => setSel(null)}>
            <span className="tog2 none" aria-hidden><ChevronLeft className="ic" /></span>
            <Folder className="ic" aria-hidden />
            <span>שורש (ללא תיקיית אב)</span>
            <span className="rad" />
          </button>
        )}
        {rows(null, 0)}
        {visible && visible.size === 0 && <div className="empty">לא נמצאו תיקיות.</div>}
      </div>
      <ErrNotice msg={err} />
      <div className="dlg-f">
        <span className="grow">{target ? <>יעד: <b>{target}</b></> : "לא נבחר יעד"}</span>
        <button type="button" className="btn btn-ghost" onClick={props.onClose} disabled={busy}>ביטול</button>
        <button type="button" className="btn btn-oak" disabled={sel === undefined || busy} onClick={() => submit(() => props.onSubmit(sel === undefined ? null : sel))}>
          {busy ? <Spin /> : null}
          {props.submitLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------- שינוי שם ---------------------------------- */

export function RenameDialog(props: { kind: "file" | "folder"; current: string; originalName?: string | null; onSubmit: (name: string) => Promise<string | null>; onClose: () => void }) {
  const [v, setV] = useState(props.current);
  const { busy, err, submit } = useSubmit(props.onClose);
  const inRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inRef.current?.focus();
    inRef.current?.select();
  }, []);
  const same = v.trim() === props.current || !v.trim();
  return (
    <Modal title={props.kind === "file" ? "שנה שם קובץ" : "שנה שם תיקייה"} icon={<Pencil className="ic" aria-hidden />} onClose={props.onClose}>
      <form
        style={{ display: "grid", gap: ".85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!same) submit(() => props.onSubmit(v.trim()));
        }}
      >
        <label className="field">
          שם חדש
          <input ref={inRef} className="input" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" maxLength={props.kind === "file" ? 255 : 200} />
        </label>
        <div className="diff">
          <div><i>עד עכשיו</i><s><NameWithExt name={props.current} /></s></div>
          <div><i>יהיה</i><em><NameWithExt name={v.trim() || "—"} /></em></div>
        </div>
        {props.kind === "file" ? (
          <div className="notice">
            <History className="ic" aria-hidden />
            <div>
              <b>השם הישן נשמר.</b> כל שינוי שם נרשם בהיסטוריית הקובץ ובקובץ המידע של התיקייה, והשם המקורי מוצג בטבלה כתגית “שם ישן” (אפשר לחפש לפיו). הקובץ בדרייב נשאר עם אותו מזהה — קישורים קיימים לא נשברים. השינוי חל גם באתר וגם בדרייב.
              {props.originalName && props.originalName !== props.current ? <> השם המקורי כרגע: <bdi className="mono">{props.originalName}</bdi>.</> : null}
            </div>
          </div>
        ) : (
          <div className="notice">
            <History className="ic" aria-hidden />
            <div>שם התיקייה ישתנה בעץ הקטגוריות של האתר וגם בדרייב, והשינוי יירשם בהיסטוריה.</div>
          </div>
        )}
        <ErrNotice msg={err} />
        <div className="dlg-f">
          <button type="button" className="btn btn-ghost" onClick={props.onClose} disabled={busy}>ביטול</button>
          <button type="submit" className="btn btn-oak" disabled={same || busy}>{busy ? <Spin /> : null}שמור שם</button>
        </div>
      </form>
    </Modal>
  );
}

/* --------------------------------- תיקייה חדשה --------------------------------- */

export function NewFolderDialog(props: { parentTitle: string; isRoot: boolean; onSubmit: (title: string) => Promise<string | null>; onClose: () => void }) {
  const [v, setV] = useState("");
  const { busy, err, submit } = useSubmit(props.onClose);
  return (
    <Modal title="תיקייה חדשה" icon={<FolderPlus className="ic" aria-hidden />} onClose={props.onClose}>
      <p className="dlg-sub">
        תיווצר תיקייה חדשה תחת <b>{props.isRoot ? "שורש הדרייב" : props.parentTitle}</b> — גם בעץ הקטגוריות של האתר וגם בדרייב. היא נוצרת כטיוטה (מוסתרת מהמשתמשות) עד שתופעל.
      </p>
      <form
        style={{ display: "grid", gap: ".85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) submit(() => props.onSubmit(v.trim()));
        }}
      >
        <label className="field">
          שם התיקייה
          <input className="input" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" maxLength={200} autoFocus placeholder="למשל: פרק ט'" />
        </label>
        {props.isRoot && (
          <div className="notice"><TriangleAlert className="ic" aria-hidden /><div>זו תהיה תיקייה ראשית (מקצוע) בשורש האתר. אם התכוונת לפרק או ליחידה — עברי קודם לתיקיית האב.</div></div>
        )}
        <ErrNotice msg={err} />
        <div className="dlg-f">
          <button type="button" className="btn btn-ghost" onClick={props.onClose} disabled={busy}>ביטול</button>
          <button type="submit" className="btn btn-oak" disabled={!v.trim() || busy}>{busy ? <Spin /> : null}צור תיקייה</button>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------------- ארכיון ----------------------------------- */

export function ArchiveDialog(props: { names: string[]; onSubmit: (reason: string) => Promise<string | null>; onClose: () => void }) {
  const [reason, setReason] = useState("הועבר ידנית מהסייר");
  const { busy, err, submit } = useSubmit(props.onClose);
  const one = props.names.length === 1;
  return (
    <Modal title="העבר לארכיון" icon={<Archive className="ic" aria-hidden />} onClose={props.onClose}>
      <p className="dlg-sub">
        {one ? <>‘<bdi>{props.names[0]}</bdi>’</> : `${props.names.length} קבצים`} יועברו לתיקיית <b>_ארכיון › לא ברור</b> בדרייב, והחומר יושהה באתר (לא יוצג למשתמשות). שום דבר לא נמחק — אפשר לשחזר בכל עת מתצוגת הארכיון.
      </p>
      <label className="field">
        סיבה (תירשם בתיאור הקובץ בדרייב)
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoComplete="off" />
      </label>
      <ErrNotice msg={err} />
      <div className="dlg-f">
        <button type="button" className="btn btn-ghost" onClick={props.onClose} disabled={busy}>ביטול</button>
        <button type="button" className="btn btn-terra" disabled={busy} onClick={() => submit(() => props.onSubmit(reason.trim() || "הועבר ידנית מהסייר"))}>
          {busy ? <Spin /> : <Archive className="ic" aria-hidden />}
          העבר לארכיון
        </button>
      </div>
    </Modal>
  );
}

/* --------------------------------- סנכרון --------------------------------- */

export function SyncDialog(props: { folderTitle: string; onPick: (scope: "all" | "folder") => void; onClose: () => void }) {
  return (
    <Modal title="סנכרון עם הדרייב" icon={<RefreshCw className="ic" aria-hidden />} onClose={props.onClose}>
      <p className="dlg-sub">
        הסנכרון עובר על תיקיות הדרייב: קובץ שנגרר ידנית לתיקייה אחרת בדרייב — האתר יתעדכן לפיו; קובץ לא מקושר שנמצא בתיקייה — יצורף כחומר טיוטה. אין מחיקות.
      </p>
      <div className="dlg-f" style={{ justifyContent: "stretch", display: "grid", gap: ".5rem" }}>
        <button type="button" className="btn btn-oak" onClick={() => props.onPick("folder")}>רק התיקייה הנוכחית: {props.folderTitle}</button>
        <button type="button" className="btn btn-ghost" onClick={() => props.onPick("all")}>כל הדרייב (בקבוצות של 40 תיקיות)</button>
        <button type="button" className="btn btn-ghost" onClick={props.onClose}>ביטול</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------- היסטוריה ---------------------------------- */

export function HistoryDialog(props: { target: { materialId?: number; categoryId?: number }; title: ReactNode; onClose: () => void }) {
  const [data, setData] = useState<{ originalName: string | null; entries: HistoryEntry[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = `${props.target.materialId ?? ""}/${props.target.categoryId ?? ""}`;
  useEffect(() => {
    let live = true;
    getHistory(props.target).then(
      (d) => live && setData(d),
      (e) => live && setErr(errMsg(e)),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <Modal title="היסטוריה" icon={<History className="ic" aria-hidden />} onClose={props.onClose}>
      <p className="dlg-sub">{props.title}</p>
      <HistoryBody data={data} err={err} />
      <div className="dlg-f"><button type="button" className="btn btn-oak" onClick={props.onClose}>סגירה</button></div>
    </Modal>
  );
}

export function HistoryBody({ data, err }: { data: { originalName: string | null; entries: HistoryEntry[] } | null; err: string | null }) {
  if (err) return <ErrNotice msg={err} />;
  if (!data) {
    return (
      <div style={{ display: "grid", gap: ".6rem" }} aria-busy="true">
        <div className="skel" /><div className="skel" style={{ width: "70%" }} /><div className="skel" style={{ width: "85%" }} />
      </div>
    );
  }
  return (
    <>
      {data.originalName && (
        <div>
          <div className="sec-t">השם המקורי</div>
          <div className="chips"><span className="old" style={{ maxWidth: "none", cursor: "default" }}><History className="ic" aria-hidden /><span><NameWithExt name={data.originalName} /></span></span></div>
        </div>
      )}
      <div>
        <div className="sec-t"><History className="ic" aria-hidden />ציר זמן</div>
        {data.entries.length === 0 ? (
          <div className="empty" style={{ padding: ".8rem" }}>אין אירועים רשומים.</div>
        ) : (
          <ol className="tl">
            {data.entries.map((e, i) => {
              const t = eventText(e);
              return (
                <li key={i} className={t.cls}>
                  <span className="when">{fmtDate(e.at, true)}</span>
                  {t.node}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}
