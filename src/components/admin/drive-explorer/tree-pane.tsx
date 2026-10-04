"use client";

import { useRef, type HTMLAttributes, type KeyboardEvent } from "react";
import { Archive, ChevronLeft, Folder, FolderOpen, HardDrive } from "lucide-react";
import type { TreeNode, ArchiveItem } from "@/lib/actions/driveExplorer";
import type { ArchiveKind } from "@/lib/driveTreeCore";
import {
  ARCHIVE_HINT,
  ARCHIVE_KINDS,
  ARCHIVE_LABEL,
  sameLoc,
  type DropTarget,
  type Loc,
  type TreeIndex,
} from "./shared";

export type Dnd = {
  props: (t: DropTarget, key: string) => HTMLAttributes<HTMLElement>;
  cls: (key: string) => string;
};

type Props = {
  ix: TreeIndex | null;
  error: string | null;
  loc: Loc;
  onNav: (l: Loc) => void;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  archive: ArchiveItem[] | null;
  archiveError: string | null;
  archOpen: boolean;
  onToggleArch: () => void;
  dnd: Dnd;
  open: boolean;
  onRetry: () => void;
};

export function TreePane(p: Props) {
  const ref = useRef<HTMLElement>(null);

  function onKey(e: KeyboardEvent<HTMLElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[role=treeitem]");
    if (!el) return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=treeitem]") ?? [])];
    const i = items.indexOf(el);
    const focus = (n: number) => {
      const t = items[Math.max(0, Math.min(items.length - 1, n))];
      t?.focus();
      e.preventDefault();
    };
    if (e.key === "ArrowDown") focus(i + 1);
    else if (e.key === "ArrowUp") focus(i - 1);
    else if (e.key === "Home") focus(0);
    else if (e.key === "End") focus(items.length - 1);
    else if (e.key === "Enter" || e.key === " ") {
      el.click();
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // RTL: חץ שמאלה פותח, חץ ימינה סוגר
      const expandable = el.getAttribute("aria-expanded");
      if (expandable == null) return;
      const isOpen = expandable === "true";
      const want = e.key === "ArrowLeft";
      if (want !== isOpen) {
        el.querySelector<HTMLElement>("[data-tog]")?.click();
        e.preventDefault();
      }
    }
  }

  const archCount = (k: ArchiveKind) => p.archive?.filter((a) => a.sub === k).length ?? null;
  const archTotal = p.archive?.length ?? null;
  const roots = p.ix?.children.get(null) ?? [];

  return (
    <aside ref={ref} className={`card tree ${p.open ? "open" : ""}`} id="dx-tree" aria-label="עץ תיקיות" onKeyDown={onKey}>
      <div className="tree-h">
        <Folder className="ic" aria-hidden />
        עץ התיקיות
        <span className="tiny">
          <button type="button" onClick={p.onExpandAll}>פתח הכל</button>
          <button type="button" onClick={p.onCollapseAll}>סגור</button>
        </span>
      </div>
      {p.error ? (
        <div className="errbox">
          {p.error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={p.onRetry}>נסי שוב</button>
        </div>
      ) : !p.ix ? (
        <div style={{ display: "grid", gap: ".6rem", padding: ".5rem" }} aria-busy="true" aria-label="טוען עץ">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skel" style={{ width: `${95 - (i % 4) * 14}%` }} />
          ))}
        </div>
      ) : (
        <ul role="tree" aria-label="תיקיות">
          <li role="none">
            <div
              role="treeitem"
              aria-level={1}
              aria-selected={p.loc.t === "cat" && p.loc.id === null}
              tabIndex={0}
              className={`trow ${p.loc.t === "cat" && p.loc.id === null ? "on" : ""} ${p.dnd.cls("root")}`}
              onClick={() => p.onNav({ t: "cat", id: null })}
              {...p.dnd.props({ kind: "cat", id: null }, "root")}
            >
              <span className="tog none" aria-hidden><ChevronLeft className="ic" /></span>
              <span className="ticon"><HardDrive className="ic" aria-hidden /></span>
              <span className="tname">דרייב (כל האתר)</span>
              <span className="cnt">{roots.reduce((s, n) => s + n.total, 0)}</span>
            </div>
            <ul role="group">
              {roots.map((n) => (
                <NodeRow key={n.id} node={n} depth={1} {...p} />
              ))}
            </ul>
          </li>

          <li role="separator" className="tsep" />

          <li role="none">
            <div
              role="treeitem"
              aria-level={1}
              aria-expanded={p.archOpen}
              aria-selected={p.loc.t === "arch" && p.loc.sub === null}
              tabIndex={-1}
              className={`trow arch ${p.loc.t === "arch" && p.loc.sub === null ? "on" : ""} ${p.dnd.cls("arch")}`}
              onClick={() => p.onNav({ t: "arch", sub: null })}
              title="הקבצים לא נמחקים — הם עוברים לתיקיית _ארכיון בדרייב. לארכוב: ⋯ › העבר לארכיון"
              {...p.dnd.props({ kind: "arch" }, "arch")}
            >
              <span
                data-tog
                className={`tog ${p.archOpen ? "open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onToggleArch();
                }}
              >
                <ChevronLeft className="ic" aria-hidden />
              </span>
              <span className="ticon"><Archive className="ic" aria-hidden /></span>
              <span className="tname">_ארכיון</span>
              {p.archiveError ? <span className="miss" title={p.archiveError}>שגיאה</span> : <span className="cnt">{archTotal ?? "…"}</span>}
            </div>
            {p.archOpen && (
              <ul role="group">
                {ARCHIVE_KINDS.map((k) => {
                  const on = sameLoc(p.loc, { t: "arch", sub: k });
                  return (
                    <li key={k} role="none">
                      <div
                        role="treeitem"
                        aria-level={2}
                        aria-selected={on}
                        tabIndex={-1}
                        className={`trow ${on ? "on" : ""} ${p.dnd.cls("arch")}`}
                        style={{ ["--d" as string]: 1 }}
                        title={ARCHIVE_HINT[k]}
                        onClick={() => p.onNav({ t: "arch", sub: k })}
                        {...p.dnd.props({ kind: "arch" }, "arch")}
                      >
                        <span className="tog none" aria-hidden><ChevronLeft className="ic" /></span>
                        <span className="ticon"><Folder className="ic" aria-hidden /></span>
                        <span className="tname">{ARCHIVE_LABEL[k]}</span>
                        <span className="cnt">{archCount(k) ?? "…"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        </ul>
      )}
    </aside>
  );
}

function NodeRow({ node, depth, ...p }: { node: TreeNode; depth: number } & Props) {
  const kids = p.ix?.children.get(node.id) ?? [];
  const open = p.expanded.has(node.id);
  const on = p.loc.t === "cat" && p.loc.id === node.id;
  const key = `c${node.id}`;
  return (
    <li role="none">
      <div
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={kids.length ? open : undefined}
        aria-selected={on}
        tabIndex={on ? 0 : -1}
        className={`trow ${on ? "on" : ""} ${p.dnd.cls(key)}`}
        style={{ ["--d" as string]: depth }}
        onClick={() => p.onNav({ t: "cat", id: node.id })}
        {...p.dnd.props({ kind: "cat", id: node.id }, key)}
      >
        <span
          data-tog
          className={`tog ${open ? "open" : ""} ${kids.length ? "" : "none"}`}
          onClick={(e) => {
            e.stopPropagation();
            p.onToggle(node.id);
          }}
        >
          <ChevronLeft className="ic" aria-hidden />
        </span>
        <span className="ticon">
          {open && kids.length ? <FolderOpen className="ic" aria-hidden /> : <Folder className="ic" aria-hidden />}
        </span>
        <span className="tname" title={node.title}>{node.title}</span>
        {node.excluded ? <span className="chip chip-gray" style={{ fontSize: ".62rem", padding: "0 .4rem" }}>לא נדרש</span> : null}
        {node.missing > 0 ? <span className="miss" title={`${node.missing} פרקים עם קבצים חסרים`}>חסר {node.missing}</span> : null}
        <span className="cnt">{node.total}</span>
      </div>
      {open && kids.length > 0 && (
        <ul role="group">
          {kids.map((k) => (
            <NodeRow key={k.id} node={k} depth={depth + 1} {...p} />
          ))}
        </ul>
      )}
    </li>
  );
}
