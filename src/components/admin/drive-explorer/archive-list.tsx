"use client";

import { useEffect, useRef } from "react";
import { Archive, ExternalLink, LoaderCircle, Undo2 } from "lucide-react";
import type { ArchiveItem } from "@/lib/actions/driveExplorer";
import type { ArchiveKind } from "@/lib/driveTreeCore";
import { ARCHIVE_HINT, ARCHIVE_LABEL, fmtDate, fmtSize, NameWithExt, relTime } from "./shared";

type Props = {
  items: ArchiveItem[] | null;
  error: string | null;
  sub: ArchiveKind | null;
  q: string;
  sel: Set<string>;
  onSel: (n: Set<string>) => void;
  onRestore: (items: ArchiveItem[]) => void;
  busy: boolean;
  onRetry: () => void;
};

export function ArchiveList(p: Props) {
  const q = p.q.trim().toLowerCase();
  const all = p.items ?? [];
  const items = all.filter((a) => (!p.sub || a.sub === p.sub) && (!q || a.name.toLowerCase().includes(q) || a.reason.toLowerCase().includes(q)));
  const allSel = items.length > 0 && items.every((a) => p.sel.has(a.id));
  const someSel = items.some((a) => p.sel.has(a.id));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !allSel && someSel;
  }, [allSel, someSel]);

  function toggle(id: string) {
    const n = new Set(p.sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    p.onSel(n);
  }
  function toggleAll() {
    const n = new Set(p.sel);
    if (allSel) items.forEach((a) => n.delete(a.id));
    else items.forEach((a) => n.add(a.id));
    p.onSel(n);
  }

  return (
    <section className="card listcard" aria-label="תצוגת הארכיון" aria-busy={p.items === null}>
      <div className="list-h">
        <h3>{p.sub ? `${ARCHIVE_LABEL[p.sub]} — פריטים בארכיון` : "כל הארכיון"}</h3>
        <span className="chip chip-blue">{items.length} פריטים</span>
        <span className="muted" style={{ fontSize: ".8rem", marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: ".35rem" }}>
          <Undo2 className="ic" aria-hidden />
          {p.sub ? ARCHIVE_HINT[p.sub] : "שחזור מחזיר חומר לקטגוריה שלו; קובץ יתום דורש לבחור תיקיית יעד"}
        </span>
      </div>
      {p.error ? (
        <div className="errbox" role="alert">
          {p.error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={p.onRetry}>נסי שוב</button>
        </div>
      ) : p.items === null ? (
        <div style={{ display: "grid", gap: ".7rem", padding: ".8rem" }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel" style={{ width: `${90 - i * 12}%` }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="empty"><Archive className="ic" aria-hidden /> {q ? "לא נמצאו תוצאות." : "הארכיון ריק כאן."}</div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th className="c-chk"><input ref={ref} className="chk" type="checkbox" checked={allSel} onChange={toggleAll} aria-label="בחירת כל הפריטים" /></th>
                <th>שם בדרייב</th>
                <th>סיבת העברה</th>
                <th className="c-size">גודל</th>
                <th className="c-mod">עודכן</th>
                <th><span className="sr">פעולות</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className={p.sel.has(a.id) ? "sel" : ""}>
                  <td className="c-chk"><input className="chk" type="checkbox" checked={p.sel.has(a.id)} onChange={() => toggle(a.id)} aria-label={`בחירת ${a.name}`} /></td>
                  <td>
                    <div className="nm">
                      <span style={{ fontWeight: 700 }}><NameWithExt name={a.name} /></span>
                      {a.materialId == null && <span className="warn-chip" title="אין חומר מקושר באתר — לשחזור צריך לבחור תיקיית יעד">יתום</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`reason r-${a.sub}`}>{a.subLabel.replace(/ \(.*\)/, "")}</span>
                    {a.reason && <span className="sub" style={{ marginTop: ".15rem" }}>{a.reason}</span>}
                  </td>
                  <td className="c-size num"><span className="sz">{fmtSize(a.size)}</span></td>
                  <td className="c-mod num">{fmtDate(a.modified)}<span className="sub">{relTime(a.modified)}</span></td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "left" }}>
                    {a.webViewLink && (
                      <a className="kebab" style={{ display: "inline-grid" }} href={a.webViewLink} target="_blank" rel="noopener noreferrer" aria-label={`פתח את ${a.name} בדרייב`} title="פתח בדרייב">
                        <ExternalLink className="ic" aria-hidden />
                      </a>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" disabled={p.busy} onClick={() => p.onRestore([a])}>
                      {p.busy ? <LoaderCircle className="ic spin-ic" aria-hidden /> : <Undo2 className="ic" aria-hidden />}
                      שחזר
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
