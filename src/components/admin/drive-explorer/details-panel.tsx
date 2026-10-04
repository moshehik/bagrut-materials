"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ExternalLink, History, MoveLeft, Pencil, X } from "lucide-react";
import { getHistory, type ExplorerFile, type HistoryEntry } from "@/lib/actions/driveExplorer";
import { errMsg, fmtDate, fmtSize, kindInfo, NameWithExt, relTime, STATUS_LABEL } from "./shared";
import { HistoryBody } from "./dialogs";

type Props = {
  file: ExplorerFile;
  location: string;
  /** מונה שמשתנה אחרי כל פעולה — כדי לרענן את ציר הזמן */
  rev: number;
  onClose: () => void;
  onRename: () => void;
  onMove: () => void;
  onArchive: () => void;
};

export function DetailsPanel({ file: f, location, rev, onClose, onRename, onMove, onArchive }: Props) {
  const [data, setData] = useState<{ originalName: string | null; entries: HistoryEntry[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const k = kindInfo(f);
  const hasOld = !!f.originalName && f.originalName !== f.fileName;

  useEffect(() => {
    let live = true;
    getHistory({ materialId: f.id }).then(
      (d) => {
        if (!live) return;
        setErr(null);
        setData(d);
      },
      (e) => live && setErr(errMsg(e)),
    );
    return () => {
      live = false;
    };
  }, [f.id, rev]);

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <>
      <div className="pscrim" onClick={onClose} aria-hidden />
      <aside className="panel" role="dialog" aria-label={`פרטי הקובץ ${f.fileName}`}>
        <div className="panel-h">
          <span className={`fi ${k.cls}`}>{k.icon}</span>
          <div style={{ minWidth: 0 }}>
            <h4><NameWithExt name={f.fileName} /></h4>
            <div className="chips" style={{ marginTop: ".35rem" }}>
              <span className={`chip kind ${k.cls}`}>{k.label}</span>
              <span className={`chip kind st-${f.status}`}>{STATUS_LABEL[f.status] ?? f.status}</span>
            </div>
          </div>
          <button ref={closeRef} type="button" className="xbtn" onClick={onClose} aria-label="סגירה"><X className="ic" aria-hidden /></button>
        </div>
        <div className="panel-b">
          <dl className="dl">
            <dt>מיקום</dt><dd>{location || "—"}</dd>
            <dt>כותרת באתר</dt><dd>{f.title}</dd>
            <dt>מזהה דרייב</dt>
            <dd>
              {f.driveId ? (
                <span className="idrow">
                  <span className="mono">{f.driveId}</span>
                  <button
                    type="button"
                    className="copy"
                    onClick={() => {
                      navigator.clipboard?.writeText(f.driveId!).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }, () => {});
                    }}
                  >
                    {copied ? "הועתק ✓" : "העתק"}
                  </button>
                </span>
              ) : "אין"}
            </dd>
            <dt>נוסף באתר</dt><dd>{fmtDate(f.createdAt, true)} <span className="muted">({relTime(f.createdAt)})</span></dd>
            <dt>עודכן בדרייב</dt><dd>{f.driveModified ? <>{fmtDate(f.driveModified, true)} <span className="muted">({relTime(f.driveModified)})</span></> : "—"}</dd>
            <dt>גודל</dt><dd>{fmtSize(f.size)}</dd>
            <dt>שם בדרייב</dt><dd>{f.driveName ? <NameWithExt name={f.driveName} /> : <span className="muted">לא נמצא בתיקייה</span>}</dd>
            {hasOld && (<><dt>שם ישן</dt><dd><span className="old" style={{ maxWidth: "none", cursor: "default" }}><History className="ic" aria-hidden /><span><NameWithExt name={f.originalName!} /></span></span></dd></>)}
          </dl>
          <div>
            <div className="sec-t"><History className="ic" aria-hidden />היסטוריית שמות והעברות</div>
            <HistoryBody data={data ? { originalName: null, entries: data.entries } : null} err={err} />
          </div>
        </div>
        <div className="panel-f">
          <button type="button" className="btn btn-ghost" onClick={onRename}><Pencil className="ic" aria-hidden />שנה שם</button>
          <button type="button" className="btn btn-ghost" onClick={onMove}><MoveLeft className="ic" aria-hidden />העבר ל…</button>
          {f.webViewLink && (
            <a className="btn btn-ghost" href={f.webViewLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="ic" aria-hidden />פתח בדרייב</a>
          )}
          <button type="button" className="btn btn-ghost" onClick={onArchive}><Archive className="ic" aria-hidden />לארכיון</button>
        </div>
      </aside>
    </>
  );
}
