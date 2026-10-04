"use client";

import { useEffect, useRef, type DragEvent } from "react";
import { ExternalLink, Ellipsis, Folder, History, LoaderCircle, Plus } from "lucide-react";
import type { ExplorerFile, FolderView, TreeNode, UnlinkedItem } from "@/lib/actions/driveExplorer";
import { fmtDate, fmtSize, kindInfo, NameWithExt, relTime, STATUS_LABEL } from "./shared";
import type { Dnd } from "./tree-pane";

type Props = {
  view: FolderView;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  q: string;
  mode: "list" | "grid";
  sel: Set<number>;
  onSel: (next: Set<number>) => void;
  activeId: number | null;
  onOpenFile: (f: ExplorerFile) => void;
  onNavFolder: (id: number) => void;
  onMenuFile: (f: ExplorerFile, anchor: HTMLElement) => void;
  onMenuFolder: (n: TreeNode, anchor: HTMLElement) => void;
  onHistory: (f: ExplorerFile) => void;
  dnd: Dnd;
  onDragStart: (e: DragEvent<HTMLElement>, kind: "file" | "folder", id: number) => void;
  onDragEnd: () => void;
  dragging: { files: Set<number>; folders: Set<number> };
  onAdopt: (items: UnlinkedItem[]) => void;
  adopting: boolean;
};

export function FileList(p: Props) {
  const { view } = p;
  const q = p.q.trim().toLowerCase();
  const folders = q ? view.folders.filter((n) => n.title.toLowerCase().includes(q)) : view.folders;
  const files = q
    ? view.files.filter((f) => [f.fileName, f.title, f.originalName ?? ""].some((s) => s.toLowerCase().includes(q)))
    : view.files;
  const unlinked = q ? view.unlinked.filter((u) => u.name.toLowerCase().includes(q)) : view.unlinked;

  const allSel = files.length > 0 && files.every((f) => p.sel.has(f.id));
  const someSel = files.some((f) => p.sel.has(f.id));
  const selAll = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selAll.current) selAll.current.indeterminate = !allSel && someSel;
  }, [allSel, someSel]);

  function toggle(id: number) {
    const n = new Set(p.sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    p.onSel(n);
  }
  function toggleAll() {
    const n = new Set(p.sel);
    if (allSel) files.forEach((f) => n.delete(f.id));
    else files.forEach((f) => n.add(f.id));
    p.onSel(n);
  }

  const nothing = !folders.length && !files.length;

  return (
    <>
      <section className="card listcard" aria-label="תוכן התיקייה" aria-busy={p.loading}>
        <div className="list-h">
          <h3>{q ? `תוצאות חיפוש: “${p.q.trim()}”` : "תוכן התיקייה"}</h3>
          <span className="chip chip-blue">{folders.length} תיקיות · {files.length} קבצים</span>
          {p.loading && <span className="muted" style={{ fontSize: ".8rem", display: "inline-flex", alignItems: "center", gap: ".3rem" }}><LoaderCircle className="ic spin-ic" aria-hidden />טוען…</span>}
        </div>

        {p.error ? (
          <div className="errbox" role="alert">
            {p.error}
            <button type="button" className="btn btn-ghost btn-sm" onClick={p.onRetry}>נסי שוב</button>
          </div>
        ) : nothing ? (
          <div className="empty">{q ? "לא נמצאו תוצאות." : p.loading ? "טוען את תוכן התיקייה…" : "התיקייה ריקה. גררי לכאן קבצים מתיקייה אחרת, או סנכרני מהדרייב."}</div>
        ) : p.mode === "grid" ? (
          <div className="gridv">
            {folders.map((n) => (
              <div
                key={`f${n.id}`}
                className={`gcard ${p.dnd.cls(`c${n.id}`)}`}
                role="button"
                tabIndex={0}
                draggable
                onClick={() => p.onNavFolder(n.id)}
                onKeyDown={(e) => e.key === "Enter" && p.onNavFolder(n.id)}
                onDragStart={(e) => p.onDragStart(e, "folder", n.id)}
                onDragEnd={p.onDragEnd}
                {...p.dnd.props({ kind: "cat", id: n.id }, `c${n.id}`)}
              >
                <span className="fi folder"><Folder className="ic" aria-hidden /></span>
                <div className="gn">{n.title}</div>
                <div className="gm">{n.total} קבצים {n.missing > 0 && <span className="miss">חסר {n.missing}</span>}</div>
              </div>
            ))}
            {files.map((f) => {
              const k = kindInfo(f);
              const hasOld = !!f.originalName && f.originalName !== f.fileName;
              return (
                <div
                  key={f.id}
                  className={`gcard ${p.sel.has(f.id) ? "sel" : ""}`}
                  role="button"
                  tabIndex={0}
                  draggable
                  onClick={() => p.onOpenFile(f)}
                  onKeyDown={(e) => e.key === "Enter" && p.onOpenFile(f)}
                  onDragStart={(e) => p.onDragStart(e, "file", f.id)}
                  onDragEnd={p.onDragEnd}
                  style={p.dragging.files.has(f.id) ? { opacity: 0.45 } : undefined}
                >
                  <input className="chk" type="checkbox" checked={p.sel.has(f.id)} onChange={() => toggle(f.id)} onClick={(e) => e.stopPropagation()} aria-label={`בחירת ${f.fileName}`} />
                  <span className={`fi ${k.cls}`}>{k.icon}</span>
                  <div className="gn"><NameWithExt name={f.fileName} /></div>
                  <div className="gm">
                    <span className={`chip kind ${k.cls}`}>{k.label}</span>
                    <span className={`chip kind st-${f.status}`}>{STATUS_LABEL[f.status] ?? f.status}</span>
                  </div>
                  <div className="gm">
                    {hasOld && (
                      <button type="button" className="old" onClick={(e) => { e.stopPropagation(); p.onHistory(f); }} title="היסטוריית שמות">
                        <History className="ic" aria-hidden /><span>שם ישן: {f.originalName}</span>
                      </button>
                    )}
                    <span className="sz">{fmtSize(f.size)}</span>
                    <button type="button" className="kebab" style={{ marginInlineStart: "auto" }} aria-haspopup="menu" aria-label={`פעולות עבור ${f.fileName}`} onClick={(e) => { e.stopPropagation(); p.onMenuFile(f, e.currentTarget); }}>
                      <Ellipsis className="ic" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th className="c-chk">
                    <input ref={selAll} className="chk" type="checkbox" checked={allSel} onChange={toggleAll} aria-label="בחירת כל הקבצים" disabled={!files.length} />
                  </th>
                  <th className="c-ico"><span className="sr">סוג</span></th>
                  <th>שם באתר</th>
                  <th className="c-kind">סוג</th>
                  <th className="c-st">סטטוס</th>
                  <th className="c-size">גודל</th>
                  <th className="c-add">נוסף</th>
                  <th className="c-mod">עודכן</th>
                  <th><span className="sr">פעולות</span></th>
                </tr>
              </thead>
              <tbody>
                {folders.map((n) => (
                  <tr
                    key={`f${n.id}`}
                    className={`${p.dnd.cls(`c${n.id}`)} ${p.dragging.folders.has(n.id) ? "dragging" : ""}`}
                    style={{ cursor: "pointer" }}
                    draggable
                    onClick={() => p.onNavFolder(n.id)}
                    onDragStart={(e) => p.onDragStart(e, "folder", n.id)}
                    onDragEnd={p.onDragEnd}
                    {...p.dnd.props({ kind: "cat", id: n.id }, `c${n.id}`)}
                  >
                    <td className="c-chk" />
                    <td className="c-ico"><span className="fi folder"><Folder className="ic" aria-hidden /></span></td>
                    <td>
                      <div className="nm">
                        <button type="button" className="t" onClick={(e) => { e.stopPropagation(); p.onNavFolder(n.id); }}>{n.title}</button>
                        {n.missing > 0 && <span className="miss" title={`${n.missing} פרקים עם קבצים חסרים`}>חסר {n.missing}</span>}
                        {n.status === "draft" && <span className="chip chip-gold kind">טיוטה</span>}
                        {n.excluded && <span className="chip chip-gray kind">לא נדרש</span>}
                        {!n.hasFolder && <span className="warn-chip" title="לתיקייה אין עדיין תיקייה בדרייב — סנכרון/העלאת מידע ייצרו אותה">אין תיקיית דרייב</span>}
                      </div>
                    </td>
                    <td className="c-kind"><span className="chip chip-gray kind">תיקייה</span></td>
                    <td className="c-st" />
                    <td className="c-size num">{n.total} קבצים</td>
                    <td className="c-add" />
                    <td className="c-mod" />
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="kebab" aria-haspopup="menu" aria-label={`פעולות עבור תיקייה ${n.title}`} onClick={(e) => { e.stopPropagation(); p.onMenuFolder(n, e.currentTarget); }}>
                        <Ellipsis className="ic" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
                {files.map((f) => {
                  const k = kindInfo(f);
                  const hasOld = !!f.originalName && f.originalName !== f.fileName;
                  return (
                    <tr
                      key={f.id}
                      draggable
                      className={`${p.sel.has(f.id) ? "sel" : ""} ${p.activeId === f.id ? "focus" : ""} ${p.dragging.files.has(f.id) ? "dragging" : ""}`}
                      onDragStart={(e) => p.onDragStart(e, "file", f.id)}
                      onDragEnd={p.onDragEnd}
                    >
                      <td className="c-chk">
                        <input className="chk" type="checkbox" checked={p.sel.has(f.id)} onChange={() => toggle(f.id)} aria-label={`בחירת ${f.fileName}`} />
                      </td>
                      <td className="c-ico"><span className={`fi ${k.cls}`}>{k.icon}</span></td>
                      <td>
                        <div className="nm">
                          <button type="button" className="t" onClick={() => p.onOpenFile(f)} title={f.title !== f.fileName ? `כותרת באתר: ${f.title}` : undefined}>
                            <NameWithExt name={f.fileName} />
                          </button>
                          {hasOld && (
                            <button type="button" className="old" onClick={() => p.onHistory(f)} title={`שם ישן: ${f.originalName} — לחצי להיסטוריה`}>
                              <History className="ic" aria-hidden />
                              <span>שם ישן: <NameWithExt name={f.originalName!} /></span>
                            </button>
                          )}
                          {view.driveFolderId && !f.inDrive && (
                            <span className="warn-chip" title="הקובץ לא נמצא כרגע בתיקיית הדרייב של הקטגוריה (אולי הועבר או נמחק ידנית). סנכרון/שינוי שם יתקנו.">לא בתיקיית הדרייב</span>
                          )}
                          {!f.driveId && <span className="warn-chip" title="לחומר אין קובץ דרייב (drive://)">אין קובץ דרייב</span>}
                        </div>
                      </td>
                      <td className="c-kind"><span className={`chip kind ${k.cls}`}>{k.label}</span></td>
                      <td className="c-st"><span className={`chip kind st-${f.status}`}>{STATUS_LABEL[f.status] ?? f.status}</span></td>
                      <td className="c-size num"><span className="sz">{fmtSize(f.size)}</span></td>
                      <td className="c-add num" title={relTime(f.createdAt)}>{fmtDate(f.createdAt)}</td>
                      <td className="c-mod num">
                        {fmtDate(f.driveModified)}
                        {f.driveModified && <span className="sub">{relTime(f.driveModified)}</span>}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="kebab" aria-haspopup="menu" aria-label={`פעולות עבור ${f.fileName}`} onClick={(e) => p.onMenuFile(f, e.currentTarget)}>
                          <Ellipsis className="ic" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {unlinked.length > 0 && (
        <section className="card listcard" aria-label="קבצים בדרייב שלא מקושרים">
          <div className="unl-h">
            <h3>קבצים בדרייב שלא מקושרים</h3>
            <span className="chip chip-gold">{unlinked.length}</span>
            <button type="button" className="btn btn-oak btn-sm" style={{ marginInlineStart: "auto" }} disabled={p.adopting} onClick={() => p.onAdopt(unlinked)}>
              {p.adopting ? <LoaderCircle className="ic spin-ic" aria-hidden /> : <Plus className="ic" aria-hidden />}
              צרף את כולם כטיוטה
            </button>
          </div>
          <p className="unl-note">הקבצים האלה נמצאים בתיקיית הדרייב של הקטגוריה אבל אין להם שורה באתר (למשל נגררו ידנית). צירוף יוצר חומר <b>בטיוטה</b> — לא גלוי למשתמשות עד שתפעילי.</p>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>שם בדרייב</th><th className="c-size">גודל</th><th className="c-mod">עודכן</th><th /></tr>
              </thead>
              <tbody>
                {unlinked.map((u) => (
                  <tr key={u.id}>
                    <td><div className="nm"><span style={{ fontWeight: 700 }}><NameWithExt name={u.name} /></span></div></td>
                    <td className="c-size num"><span className="sz">{fmtSize(u.size)}</span></td>
                    <td className="c-mod num">{fmtDate(u.modified)}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "left" }}>
                      {u.webViewLink && (
                        <a className="btn btn-ghost btn-sm" href={u.webViewLink} target="_blank" rel="noopener noreferrer" style={{ marginInlineEnd: ".4rem" }}>
                          <ExternalLink className="ic" aria-hidden />פתח בדרייב
                        </a>
                      )}
                      <button type="button" className="btn btn-oak btn-sm" disabled={p.adopting} onClick={() => p.onAdopt([u])}>
                        <Plus className="ic" aria-hidden />צרף כחומר (טיוטה)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
