"use client";

import "./drive-explorer/drive-explorer.css";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  Download,
  ExternalLink,
  FolderPlus,
  HardDrive,
  History,
  LayoutGrid,
  List,
  LoaderCircle,
  Menu as MenuIcon,
  MoveLeft,
  Pencil,
  RefreshCw,
  Search,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import {
  adoptUnlinkedAction,
  archiveMaterialsAction,
  createFolderAction,
  getArchiveView,
  getExplorerTree,
  getFolderView,
  moveCategoriesAction,
  moveMaterialsAction,
  refreshInfoAction,
  renameCategoryAction,
  renameMaterialAction,
  restoreFromArchiveAction,
  syncFromDriveAction,
  type ActionResult,
  type ArchiveItem,
  type ExplorerFile,
  type FolderView,
  type TreeNode,
  type UnlinkedItem,
} from "@/lib/actions/driveExplorer";
import {
  ARCHIVE_LABEL,
  ancestorsOf,
  errMsg,
  indexTree,
  isSelfOrDescendant,
  pathTitles,
  type DragPayload,
  type DropTarget,
  type DropVerdict,
  type Loc,
  type ToastItem,
} from "./drive-explorer/shared";
import { TreePane, type Dnd } from "./drive-explorer/tree-pane";
import { InfoCard } from "./drive-explorer/info-card";
import { FileList } from "./drive-explorer/file-list";
import { ArchiveList } from "./drive-explorer/archive-list";
import { DetailsPanel } from "./drive-explorer/details-panel";
import { MenuPopup, type MenuItem } from "./drive-explorer/menu";
import {
  ArchiveDialog,
  HistoryDialog,
  MovePickerDialog,
  NewFolderDialog,
  RenameDialog,
  SyncDialog,
} from "./drive-explorer/dialogs";

type Dialog =
  | { t: "move"; files: ExplorerFile[] }
  | { t: "moveFolder"; node: TreeNode }
  | { t: "restore"; items: ArchiveItem[] }
  | { t: "rename"; file: ExplorerFile }
  | { t: "renameFolder"; node: TreeNode }
  | { t: "history"; file?: ExplorerFile; node?: TreeNode }
  | { t: "archive"; files: ExplorerFile[] }
  | { t: "newFolder" }
  | { t: "sync" };

type SyncState = {
  running: boolean;
  cancelled: boolean;
  scope: "all" | "folder";
  scanned: number;
  batches: number;
  adopted: number;
  moved: number;
  errors: string[];
  fatal: string | null;
};

type InfoOverride = { text: string; uploadedAt: string | null; fileId: string | null } | null;

const EMPTY_DRAG = { files: new Set<number>(), folders: new Set<number>() };

export function DriveExplorer() {
  /* ---------------- נתונים ---------------- */
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [treeErr, setTreeErr] = useState<string | null>(null);
  const [archive, setArchive] = useState<ArchiveItem[] | null>(null);
  const [archiveErr, setArchiveErr] = useState<string | null>(null);
  const [view, setView] = useState<FolderView | null>(null);
  const [viewErr, setViewErr] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  /* ---------------- ממשק ---------------- */
  const [loc, setLoc] = useState<Loc>({ t: "cat", id: null });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [archOpen, setArchOpen] = useState(true);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [archSel, setArchSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"list" | "grid">("list");
  const [drawer, setDrawer] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detailRev, setDetailRev] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [infoOv, setInfoOv] = useState<InfoOverride>(null);
  const [infoBusy, setInfoBusy] = useState<"refresh" | "upload" | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [busy, startBusy] = useTransition();

  /* ---------------- ref-ים לערכים עדכניים (למנוע closures ישנים) ---------------- */
  const ix = useMemo(() => (tree ? indexTree(tree) : null), [tree]);
  const ixRef = useRef(ix);
  const viewRef = useRef(view);
  const archiveRef = useRef(archive);
  const locRef = useRef(loc);
  const selRef = useRef(sel);
  // מעדכן את ה-ref-ים אחרי כל רינדור (ולא בזמן רינדור) — ה-handlers קוראים תמיד את הערך האחרון
  useEffect(() => {
    ixRef.current = ix;
    viewRef.current = view;
    archiveRef.current = archive;
    locRef.current = loc;
    selRef.current = sel;
  });
  const viewReq = useRef(0);
  const toastSeq = useRef(0);
  const syncCancel = useRef(false);

  const locked = busy || !!sync?.running;

  /* ---------------- טוסטים ---------------- */
  const toast = useCallback((msg: string, tone: ToastItem["tone"] = "ok") => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, tone, msg }].slice(-4));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "err" ? 12000 : 4500);
  }, []);

  /* ---------------- טעינות ---------------- */
  const loadTree = useCallback(async () => {
    try {
      setTree(await getExplorerTree());
      setTreeErr(null);
    } catch (e) {
      setTreeErr(`טעינת העץ נכשלה: ${errMsg(e)}`);
    }
  }, []);

  const loadArchive = useCallback(async () => {
    try {
      setArchive(await getArchiveView());
      setArchiveErr(null);
    } catch (e) {
      setArchiveErr(`טעינת הארכיון נכשלה: ${errMsg(e)}`);
    }
  }, []);

  const loadView = useCallback(async (id: number | null, keep = false) => {
    const n = ++viewReq.current;
    setViewLoading(true);
    setViewErr(null);
    if (!keep) setView(null);
    try {
      const v = await getFolderView(id);
      if (n !== viewReq.current) return;
      setView(v);
      setInfoOv(null);
      setLoadedAt(new Date());
      const ids = new Set(v.files.map((f) => f.id));
      setSel((s) => new Set([...s].filter((x) => ids.has(x))));
    } catch (e) {
      if (n === viewReq.current) setViewErr(`טעינת התיקייה נכשלה: ${errMsg(e)}`);
    } finally {
      if (n === viewReq.current) setViewLoading(false);
    }
  }, []);

  const refreshAll = useCallback(
    async (withArchive = false) => {
      const l = locRef.current;
      await Promise.all([loadTree(), l.t === "cat" ? loadView(l.id, true) : Promise.resolve(), withArchive || l.t === "arch" ? loadArchive() : Promise.resolve()]);
      setDetailRev((r) => r + 1);
    },
    [loadTree, loadView, loadArchive],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינת נתונים בעליית העמוד
    void loadTree();
    void loadArchive();
  }, [loadTree, loadArchive]);

  useEffect(() => {
    // איפוס בחירה/חיפוש וטעינת התצוגה בכל מעבר מיקום
    /* eslint-disable react-hooks/set-state-in-effect */
    setSel(new Set());
    setArchSel(new Set());
    setActiveId(null);
    setQ("");
    if (loc.t === "cat") void loadView(loc.id);
    else {
      viewReq.current++;
      setViewLoading(false);
      setViewErr(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loc, loadView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- ניווט ---------------- */
  const navTo = useCallback((l: Loc) => {
    setLoc(l);
    setDrawer(false);
    if (l.t === "cat" && l.id != null && ixRef.current) {
      const anc = ancestorsOf(ixRef.current, l.id);
      setExpanded((s) => new Set([...s, ...anc]));
    }
  }, []);

  const toggleNode = useCallback((id: number) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);

  /* ---------------- ביצוע פעולות ---------------- */
  const nameOf = useCallback((id: number | string): string => {
    const v = viewRef.current;
    const f = typeof id === "number" ? v?.files.find((x) => x.id === id) : undefined;
    if (f) return f.fileName;
    const a = typeof id === "string" ? archiveRef.current?.find((x) => x.id === id) : undefined;
    if (a) return a.name;
    const u = typeof id === "string" ? v?.unlinked.find((x) => x.id === id) : undefined;
    if (u) return u.name;
    const n = typeof id === "number" ? ixRef.current?.byId.get(id) : undefined;
    return n ? n.title : String(id);
  }, []);

  /** מריץ פעולת שרת, מציג תוצאה *אמיתית* (כולל result.failed), ומרענן תצוגה+עץ. מחזיר שגיאה (מחרוזת) רק כשנזרקה חריגה. */
  const perform = useCallback(
    (fn: () => Promise<ActionResult>, opts: { archive?: boolean; ok: (r: ActionResult) => string }) =>
      new Promise<string | null>((resolve) => {
        startBusy(async () => {
          let thrown: string | null = null;
          try {
            const r = await fn();
            const fails = r.failed ?? [];
            if (r.ok && !fails.length) toast(opts.ok(r), "ok");
            else {
              const detail = fails.length
                ? fails.slice(0, 3).map((f) => `${nameOf(f.id)}: ${f.error}`).join(" · ") + (fails.length > 3 ? ` · ועוד ${fails.length - 3}` : "")
                : r.error ?? "הפעולה נכשלה";
              toast(`${r.moved ? `בוצע חלקית (${r.moved} הצליחו). ` : ""}${detail}`, "err");
            }
          } catch (e) {
            thrown = errMsg(e);
            toast(thrown, "err");
          }
          await refreshAll(opts.archive);
          resolve(thrown);
        });
      }),
    [toast, nameOf, refreshAll],
  );

  const doMoveFiles = useCallback(
    (ids: number[], target: number) => {
      const title = ixRef.current?.byId.get(target)?.title ?? "היעד";
      setSel(new Set());
      return perform(() => moveMaterialsAction(ids, target), {
        ok: (r) => `${r.moved === 1 ? "הקובץ הועבר" : `${r.moved} קבצים הועברו`} אל ${title} — באתר ובדרייב`,
      });
    },
    [perform],
  );

  const doMoveFolders = useCallback(
    (ids: number[], target: number | null) => {
      const title = target == null ? "שורש האתר" : ixRef.current?.byId.get(target)?.title ?? "היעד";
      return perform(() => moveCategoriesAction(ids, target), {
        ok: (r) => `${r.moved === 1 ? "התיקייה הועברה" : `${r.moved} תיקיות הועברו`} אל ${title} — באתר ובדרייב`,
      });
    },
    [perform],
  );

  const doArchive = useCallback(
    (ids: number[], reason: string) => {
      setSel(new Set());
      setActiveId(null);
      return perform(() => archiveMaterialsAction(ids, reason), {
        archive: true,
        ok: (r) => `${r.moved === 1 ? "הקובץ הועבר" : `${r.moved} קבצים הועברו`} לארכיון והחומר הושהה באתר`,
      });
    },
    [perform],
  );

  const doRestore = useCallback(
    async (items: ArchiveItem[], target?: number | null) => {
      setArchSel(new Set());
      const linked = items.filter((i) => i.materialId != null).map((i) => i.id);
      const orphans = items.filter((i) => i.materialId == null).map((i) => i.id);
      let err: string | null = null;
      if (linked.length) {
        err = await perform(() => restoreFromArchiveAction(linked), { archive: true, ok: (r) => `שוחזרו ${r.moved} פריטים לקטגוריה המקורית (כטיוטה אם היו מושהים)` });
      }
      if (orphans.length && target != null && !err) {
        err = await perform(() => restoreFromArchiveAction(orphans, target), {
          archive: true,
          ok: (r) => `${r.moved} קבצים יתומים שוחזרו אל ${ixRef.current?.byId.get(target)?.title ?? "היעד"} כחומרי טיוטה`,
        });
      }
      return err;
    },
    [perform],
  );

  const doAdopt = useCallback(
    async (items: UnlinkedItem[]) => {
      const v = viewRef.current;
      if (!v || v.categoryId == null) return;
      setAdopting(true);
      try {
        await perform(() => adoptUnlinkedAction(items.map((i) => i.id), v.categoryId!), {
          archive: false,
          ok: (r) => `${r.moved === 1 ? "קובץ אחד צורף" : `${r.moved} קבצים צורפו`} כחומרי טיוטה`,
        });
      } finally {
        setAdopting(false);
      }
    },
    [perform],
  );

  /* ---------------- קובץ מידע ---------------- */
  const infoText = infoOv?.text ?? view?.info.text ?? "";

  async function infoRefresh() {
    const v = viewRef.current;
    if (!v) return;
    setInfoBusy("refresh");
    try {
      const r = await refreshInfoAction(v.categoryId, false);
      setInfoOv((o) => ({ text: r.text, uploadedAt: o?.uploadedAt ?? null, fileId: o?.fileId ?? null }));
      toast("הטקסט נוצר מחדש מנתוני האתר ברגע זה (עדיין לא הועלה לדרייב)");
    } catch (e) {
      toast(`הרענון נכשל: ${errMsg(e)}`, "err");
    } finally {
      setInfoBusy(null);
    }
  }

  async function infoUpload() {
    const v = viewRef.current;
    if (!v) return;
    setInfoBusy("upload");
    try {
      const r = await refreshInfoAction(v.categoryId, true);
      if (!r.ok) {
        toast(`ההעלאה לדרייב נכשלה: ${r.error ?? "שגיאה לא ידועה"}`, "err");
        setInfoOv((o) => ({ text: r.text, uploadedAt: o?.uploadedAt ?? null, fileId: o?.fileId ?? null }));
      } else {
        setInfoOv({ text: r.text, uploadedAt: new Date().toISOString(), fileId: r.fileId ?? v.info.fileId });
        toast("קובץ המידע הועלה לדרייב (_מידע.txt)");
      }
    } catch (e) {
      toast(`ההעלאה לדרייב נכשלה: ${errMsg(e)}`, "err");
    } finally {
      setInfoBusy(null);
    }
  }

  function infoDownload() {
    const text = infoText;
    if (!text) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }));
    a.download = "_מידע.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("הורד הקובץ _מידע.txt");
  }

  /* ---------------- סנכרון ---------------- */
  async function runSync(scope: "all" | "folder") {
    const l = locRef.current;
    const only = scope === "folder" && l.t === "cat" && l.id != null ? l.id : undefined;
    syncCancel.current = false;
    let st: SyncState = { running: true, cancelled: false, scope, scanned: 0, batches: 0, adopted: 0, moved: 0, errors: [], fatal: null };
    setSync(st);
    let cursor: number | null = 0;
    try {
      while (cursor !== null) {
        const r: Awaited<ReturnType<typeof syncFromDriveAction>> = await syncFromDriveAction(cursor, only);
        st = {
          ...st,
          scanned: st.scanned + r.scanned,
          batches: st.batches + 1,
          adopted: st.adopted + r.adopted,
          moved: st.moved + r.moved,
          errors: [...st.errors, ...r.errors].slice(0, 30),
        };
        setSync(st);
        cursor = r.nextCursor;
        if (syncCancel.current) {
          st = { ...st, cancelled: true };
          break;
        }
      }
    } catch (e) {
      st = { ...st, fatal: errMsg(e) };
    }
    st = { ...st, running: false };
    setSync(st);
    const summary = `נסרקו ${st.scanned} תיקיות · צורפו ${st.adopted} קבצים · עודכן מיקום של ${st.moved}`;
    if (st.fatal) toast(`הסנכרון נעצר בשגיאה: ${st.fatal}. ${summary}`, "err");
    else if (st.errors.length) toast(`הסנכרון הסתיים עם ${st.errors.length} שגיאות. ${summary}`, "err");
    else toast(`${st.cancelled ? "הסנכרון הופסק. " : "הסנכרון הסתיים. "}${summary}`);
    await refreshAll(true);
  }

  /* ---------------- גרירה ושחרור ---------------- */
  const dragRef = useRef<DragPayload | null>(null);
  const [dragging, setDragging] = useState(EMPTY_DRAG);
  const [hover, setHover] = useState<{ key: string; verdict: DropVerdict; label: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const verdict = useCallback((t: DropTarget, d: DragPayload): DropVerdict => {
    if (t.kind === "arch") return { ok: false, reason: "לארכיון מעבירים דרך ⋯ ← ״העבר לארכיון״ (כדי שהסיבה תירשם)" };
    const index = ixRef.current;
    if (!index) return { ok: false, reason: "העץ עדיין נטען" };
    if (d.files.length) {
      if (t.id === null) return { ok: false, reason: "אי אפשר להניח קבצים בשורש — בחרי תיקייה" };
      if (viewRef.current?.categoryId === t.id) return { ok: false, reason: "הקבצים כבר נמצאים בתיקייה הזו" };
      return { ok: true };
    }
    for (const id of d.folders) {
      if (t.id !== null && isSelfOrDescendant(index, id, t.id)) return { ok: false, reason: "אי אפשר להעביר תיקייה אל תוך עצמה או אל תת-תיקייה שלה" };
      if ((index.byId.get(id)?.parentId ?? null) === t.id) return { ok: false, reason: "התיקייה כבר נמצאת שם" };
    }
    return { ok: true };
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(EMPTY_DRAG);
    setHover(null);
    setDragActive(false);
  }, []);

  const onDragStart = useCallback(
    (e: DragEvent<HTMLElement>, kind: "file" | "folder", id: number) => {
      const payload: DragPayload = kind === "file" ? { files: selRef.current.has(id) ? [...selRef.current] : [id], folders: [] } : { files: [], folders: [id] };
      dragRef.current = payload;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify(payload));
      const label = kind === "file" ? (payload.files.length === 1 ? nameOf(id) : `${payload.files.length} קבצים`) : nameOf(id);
      const g = document.createElement("div");
      g.textContent = label;
      g.setAttribute("style", "position:fixed;top:-100px;left:-100px;background:#212f4d;color:#fff;padding:.35rem .9rem;border-radius:99px;font-weight:800;font-size:.85rem;direction:rtl");
      document.body.appendChild(g);
      e.dataTransfer.setDragImage(g, 10, 10);
      setTimeout(() => {
        g.remove();
        setDragging({ files: new Set(payload.files), folders: new Set(payload.folders) });
        setDragActive(true);
      }, 0);
    },
    [nameOf],
  );

  const labelOf = useCallback((t: DropTarget) => (t.kind === "arch" ? "_ארכיון" : t.id === null ? "שורש האתר" : ixRef.current?.byId.get(t.id)?.title ?? ""), []);

  const dnd: Dnd = useMemo(
    () => ({
      cls: (key) => (hover?.key === key ? (hover.verdict.ok ? "dragover" : "nodrop") : ""),
      props: (t, key) => ({
        onDragOver: (e) => {
          const d = dragRef.current;
          if (!d) return;
          e.preventDefault();
          const v = verdict(t, d);
          e.dataTransfer.dropEffect = v.ok ? "move" : "none";
          setHover((h) => (h?.key === key ? h : { key, verdict: v, label: labelOf(t) }));
        },
        onDragLeave: (e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setHover((h) => (h?.key === key ? null : h));
        },
        onDrop: (e) => {
          const d = dragRef.current;
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          const v = verdict(t, d);
          endDrag();
          if (!v.ok) {
            toast(v.reason, "err");
            return;
          }
          if (t.kind !== "cat") return;
          if (d.files.length) void doMoveFiles(d.files, t.id as number);
          else void doMoveFolders(d.folders, t.id);
        },
      }),
    }),
    [hover, verdict, labelOf, endDrag, toast, doMoveFiles, doMoveFolders],
  );

  /* ---------------- תפריטים ופתיחת דיאלוגים ---------------- */
  const closeMenu = useCallback(() => setMenu(null), []);
  const openDrive = (url: string | null) => url && window.open(url, "_blank", "noopener,noreferrer");

  const fileMenu = useCallback(
    (f: ExplorerFile, anchor: HTMLElement) => {
      setMenu({
        anchor,
        items: [
          { key: "rename", label: "שנה שם", icon: <Pencil className="ic" aria-hidden />, onSelect: () => setDialog({ t: "rename", file: f }) },
          { key: "move", label: "העבר ל…", icon: <MoveLeft className="ic" aria-hidden />, onSelect: () => setDialog({ t: "move", files: [f] }) },
          { key: "history", label: "היסטוריה", icon: <History className="ic" aria-hidden />, onSelect: () => setDialog({ t: "history", file: f }) },
          { key: "drive", label: "פתח בדרייב", icon: <ExternalLink className="ic" aria-hidden />, disabled: !f.webViewLink, onSelect: () => openDrive(f.webViewLink) },
          "sep",
          { key: "archive", label: "העבר לארכיון", icon: <Archive className="ic" aria-hidden />, danger: true, onSelect: () => setDialog({ t: "archive", files: [f] }) },
        ],
      });
    },
    [],
  );

  const folderMenu = useCallback((n: TreeNode, anchor: HTMLElement) => {
    setMenu({
      anchor,
      items: [
        { key: "rename", label: "שנה שם", icon: <Pencil className="ic" aria-hidden />, onSelect: () => setDialog({ t: "renameFolder", node: n }) },
        { key: "move", label: "העבר ל…", icon: <MoveLeft className="ic" aria-hidden />, onSelect: () => setDialog({ t: "moveFolder", node: n }) },
        { key: "history", label: "היסטוריה", icon: <History className="ic" aria-hidden />, onSelect: () => setDialog({ t: "history", node: n }) },
      ],
    });
  }, []);

  /* ---------------- נגזרות ---------------- */
  const roots = ix?.children.get(null) ?? [];
  const totalFiles = roots.reduce((s, n) => s + n.total, 0);
  const totalMissing = roots.reduce((s, n) => s + n.missing, 0);
  const isCat = loc.t === "cat";
  const curId = loc.t === "cat" ? loc.id : null;
  const driveFolderUrl = view?.driveFolderId && isCat ? `https://drive.google.com/drive/folders/${view.driveFolderId}` : null;
  const activeFile = activeId != null ? view?.files.find((f) => f.id === activeId) ?? null : null;
  const selectedFiles = useMemo(() => (view ? view.files.filter((f) => sel.has(f.id)) : []), [view, sel]);
  const selectedArch = useMemo(() => (archive ?? []).filter((a) => archSel.has(a.id)), [archive, archSel]);

  const crumbs: { label: string; loc?: Loc; key: string; drop?: DropTarget }[] = [{ label: "דרייב", key: "root", loc: { t: "cat", id: null }, drop: { kind: "cat", id: null } }];
  if (loc.t === "cat") {
    if (view && view.categoryId === loc.id) for (const p of view.path) crumbs.push({ label: p.title, key: `c${p.id}`, loc: { t: "cat", id: p.id }, drop: { kind: "cat", id: p.id } });
    else if (ix && loc.id != null) {
      const trail = [...ancestorsOf(ix, loc.id).reverse(), loc.id];
      for (const id of trail) crumbs.push({ label: ix.byId.get(id)?.title ?? "…", key: `c${id}`, loc: { t: "cat", id }, drop: { kind: "cat", id } });
    }
  } else {
    crumbs.push({ label: "_ארכיון", key: "arch", loc: { t: "arch", sub: null } });
    if (loc.sub) crumbs.push({ label: ARCHIVE_LABEL[loc.sub], key: `a-${loc.sub}`, loc: loc });
  }
  const crumbsFinal = crumbs.map((c, i) => ({ ...c, last: i === crumbs.length - 1 }));

  const syncPct = sync && sync.scope === "folder" ? (sync.running ? 50 : 100) : null;

  return (
    <div className="dx">
      {(busy || infoBusy) && <div className="busy-bar" role="progressbar" aria-label="פעולה מתבצעת" />}

      <div className="page-h">
        <h2 className="font-display">סייר קבצי דרייב</h2>
        <span className="chip chip-oak">{tree ? `${totalFiles} חומרים באתר` : "טוען…"} · {archive ? `${archive.length} בארכיון` : archiveErr ? "ארכיון: שגיאה" : "ארכיון…"}</span>
        {tree && totalMissing > 0 && <span className="chip chip-red" title="פרקים שחסר בהם לפחות קובץ אחד מקבצי החבילה הסטנדרטית">{totalMissing} פרקים עם קבצים חסרים</span>}
        <span className="sync-note">
          <span className="dot" aria-hidden />
          {loadedAt ? `נטען ${loadedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : "טוען…"}
        </span>
      </div>

      {/* סרגל כלים */}
      <section className="card toolbar" aria-label="כלים">
        <div className="tb-row">
          <button type="button" className="btn btn-ghost drawer-btn" onClick={() => setDrawer(true)} aria-label="פתיחת עץ התיקיות" aria-controls="dx-tree" aria-expanded={drawer}>
            <MenuIcon className="ic" aria-hidden />עץ תיקיות
          </button>
          <nav className="crumbs" aria-label="מיקום">
            {/* eslint-disable-next-line react-hooks/refs -- dnd.props סוגר על ref-ים רק בתוך handlers */}
            {crumbsFinal.map((c, i) => (
              <span key={c.key} style={{ display: "inline-flex", alignItems: "center" }}>
                {i > 0 && <span className="sep" aria-hidden><ChevronLeft className="ic" /></span>}
                <button
                  type="button"
                  className={`${c.last ? "last" : ""} ${c.drop ? dnd.cls(c.key === "root" ? "root" : c.key) : ""}`}
                  aria-current={c.last ? "page" : undefined}
                  onClick={() => !c.last && c.loc && navTo(c.loc)}
                  {...(c.drop && !c.last ? dnd.props(c.drop, c.key === "root" ? "root" : c.key) : {})}
                >
                  {i === 0 && <HardDrive className="ic" aria-hidden />}
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
          <label className="search">
            <span className="sr">חיפוש</span>
            <Search className="ic" aria-hidden />
            <input className="input" type="search" placeholder="חיפוש שם (כולל שמות ישנים)…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </label>
          <div className="seg" role="group" aria-label="תצוגה">
            <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")} title="רשימה" aria-label="תצוגת רשימה"><List className="ic" aria-hidden /></button>
            <button type="button" aria-pressed={mode === "grid"} onClick={() => setMode("grid")} title="רשת" aria-label="תצוגת רשת"><LayoutGrid className="ic" aria-hidden /></button>
          </div>
        </div>
        <div className="tb-actions">
          <button type="button" className="btn btn-oak" disabled={!isCat || locked || !tree} onClick={() => setDialog({ t: "newFolder" })} title={isCat ? undefined : "בארכיון אי אפשר ליצור תיקיות"}>
            <FolderPlus className="ic" aria-hidden />תיקייה חדשה
          </button>
          <button type="button" className="btn btn-ghost" disabled={locked || !!sync?.running} onClick={() => (isCat && curId != null ? setDialog({ t: "sync" }) : void runSync("all"))}>
            {sync?.running ? <LoaderCircle className="ic spin-ic" aria-hidden /> : <RefreshCw className="ic" aria-hidden />}
            סנכרון עם הדרייב
          </button>
          <button type="button" className="btn btn-ghost" disabled={!isCat || !view || !infoText} onClick={infoDownload} title={isCat ? undefined : "קובץ מידע קיים רק לתיקיות האתר"}>
            <Download className="ic" aria-hidden />הורדת קובץ מידע
          </button>
          <button type="button" className="btn btn-ghost" disabled={!driveFolderUrl} onClick={() => openDrive(driveFolderUrl)} title={driveFolderUrl ? "קישור ישיר לדרייב (למנהלת בלבד) — לא ייפתח מאחורי נטפרי / סינון אינטרנט" : "לתיקייה הזו אין (עדיין) תיקיית דרייב מקושרת"}>
            <ExternalLink className="ic" aria-hidden />פתח בדרייב
          </button>
          <span className="hint">גררי קבצים או תיקיות אל תיקייה בעץ כדי להעביר · הכול מתעדכן באתר ובדרייב</span>
        </div>
      </section>

      {/* התקדמות סנכרון */}
      {sync && (
        <section className="card syncbox" aria-live="polite">
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center" }}>
            {sync.running ? <LoaderCircle className="ic spin-ic" aria-hidden /> : sync.fatal ? <TriangleAlert className="ic" aria-hidden /> : <CheckCircle2 className="ic" aria-hidden />}
            <b>{sync.running ? "מסנכרנת עם הדרייב…" : sync.cancelled ? "הסנכרון הופסק" : sync.fatal ? "הסנכרון נעצר בשגיאה" : "הסנכרון הסתיים"}</b>
            <span className="muted">
              {sync.scanned} תיקיות נסרקו ({sync.batches} קבוצות) · צורפו {sync.adopted} קבצים · עודכן מיקום של {sync.moved}
            </span>
            <span style={{ marginInlineStart: "auto", display: "flex", gap: ".4rem" }}>
              {sync.running ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => (syncCancel.current = true)}>הפסק אחרי הקבוצה הנוכחית</button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSync(null)}>סגירה</button>
              )}
            </span>
          </div>
          {sync.running && <div className="bar" aria-hidden><i style={{ width: syncPct != null ? `${syncPct}%` : "100%", opacity: syncPct != null ? 1 : 0.5 }} /></div>}
          {sync.fatal && <div style={{ color: "var(--terra-deep)" }}>{sync.fatal}</div>}
          {sync.errors.length > 0 && (
            <ul>
              {sync.errors.map((er, i) => <li key={i}>{er}</li>)}
            </ul>
          )}
        </section>
      )}

      <div className="xp">
        <TreePane
          ix={ix}
          error={treeErr}
          loc={loc}
          onNav={navTo}
          expanded={expanded}
          onToggle={toggleNode}
          onExpandAll={() => setExpanded(new Set((tree ?? []).filter((n) => (ix?.children.get(n.id)?.length ?? 0) > 0).map((n) => n.id)))}
          onCollapseAll={() => setExpanded(new Set())}
          archive={archive}
          archiveError={archiveErr}
          archOpen={archOpen}
          onToggleArch={() => setArchOpen((o) => !o)}
          dnd={dnd}
          open={drawer}
          onRetry={() => void loadTree()}
        />
        <div className={`scrim ${drawer ? "on" : ""}`} onClick={() => setDrawer(false)} aria-hidden />

        <div className="main">
          {loc.t === "cat" ? (
            <>
              {view && view.categoryId === loc.id ? (
                <InfoCard
                  view={view}
                  text={infoText}
                  uploadedAt={infoOv?.uploadedAt ?? null}
                  fileId={infoOv?.fileId ?? view.info.fileId}
                  busy={infoBusy}
                  onRefresh={() => void infoRefresh()}
                  onUpload={() => void infoUpload()}
                  onDownload={infoDownload}
                  onSync={() => setDialog({ t: "sync" })}
                />
              ) : !viewErr ? (
                <section className="card info" aria-busy="true" aria-label="טוען קובץ מידע">
                  <div className="info-h"><h3>קובץ מידע של התיקייה</h3></div>
                  <div style={{ display: "grid", gap: ".6rem", padding: "0 1.1rem 1.1rem" }}>
                    {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skel" style={{ width: `${95 - i * 9}%` }} />)}
                  </div>
                </section>
              ) : null}

              {view && view.categoryId === loc.id ? (
                <FileList
                  view={view}
                  loading={viewLoading}
                  error={viewErr}
                  onRetry={() => void loadView(loc.id, true)}
                  q={q}
                  mode={mode}
                  sel={sel}
                  onSel={setSel}
                  activeId={activeId}
                  onOpenFile={(f) => setActiveId(f.id)}
                  onNavFolder={(id) => navTo({ t: "cat", id })}
                  onMenuFile={fileMenu}
                  onMenuFolder={folderMenu}
                  onHistory={(f) => setDialog({ t: "history", file: f })}
                  dnd={dnd}
                  onDragStart={onDragStart}
                  onDragEnd={endDrag}
                  dragging={dragging}
                  onAdopt={(items) => void doAdopt(items)}
                  adopting={adopting || locked}
                />
              ) : viewErr ? (
                <section className="card listcard">
                  <div className="errbox" role="alert">
                    {viewErr}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadView(loc.id)}>נסי שוב</button>
                  </div>
                </section>
              ) : (
                <section className="card listcard" aria-busy="true" aria-label="טוען תוכן התיקייה">
                  <div style={{ display: "grid", gap: ".8rem", padding: "1rem" }}>
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel" style={{ width: `${96 - (i % 3) * 12}%`, height: "1.6rem" }} />)}
                  </div>
                </section>
              )}

              {selectedFiles.length > 0 && (
                <div className="bulk" role="toolbar" aria-label="פעולות על הקבצים הנבחרים">
                  <b>{selectedFiles.length} נבחרו</b>
                  <button type="button" className="btn" disabled={locked} onClick={() => setDialog({ t: "move", files: selectedFiles })}><MoveLeft className="ic" aria-hidden />העבר ל…</button>
                  <button type="button" className="btn" disabled={locked} onClick={() => setDialog({ t: "archive", files: selectedFiles })}><Archive className="ic" aria-hidden />העבר לארכיון</button>
                  <button type="button" className="btn x" onClick={() => setSel(new Set())}><X className="ic" aria-hidden />ביטול בחירה</button>
                </div>
              )}
            </>
          ) : (
            <>
              <ArchiveList
                items={archive}
                error={archiveErr}
                sub={loc.sub}
                q={q}
                sel={archSel}
                onSel={setArchSel}
                busy={locked}
                onRetry={() => void loadArchive()}
                onRestore={(items) => (items.some((i) => i.materialId == null) ? setDialog({ t: "restore", items }) : void doRestore(items))}
              />
              {selectedArch.length > 0 && (
                <div className="bulk" role="toolbar" aria-label="פעולות על הפריטים הנבחרים">
                  <b>{selectedArch.length} נבחרו</b>
                  <button type="button" className="btn" disabled={locked} onClick={() => (selectedArch.some((i) => i.materialId == null) ? setDialog({ t: "restore", items: selectedArch }) : void doRestore(selectedArch))}>
                    <Undo2 className="ic" aria-hidden />שחזר
                  </button>
                  <button type="button" className="btn x" onClick={() => setArchSel(new Set())}><X className="ic" aria-hidden />ביטול בחירה</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* פאנל פרטים */}
      {activeFile && view && (
        <DetailsPanel
          key={activeFile.id}
          file={activeFile}
          location={pathTitles(ix ?? { byId: new Map(), children: new Map() }, view.categoryId) || "שורש"}
          rev={detailRev}
          onClose={() => setActiveId(null)}
          onRename={() => setDialog({ t: "rename", file: activeFile })}
          onMove={() => setDialog({ t: "move", files: [activeFile] })}
          onArchive={() => setDialog({ t: "archive", files: [activeFile] })}
        />
      )}

      {menu && <MenuPopup anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}

      {/* דיאלוגים */}
      {dialog?.t === "move" && ix && (
        <MovePickerDialog
          title="העבר ל…"
          subtitle={dialog.files.length === 1 ? <>‘<bdi>{dialog.files[0].fileName}</bdi>’. בחרי תיקיית יעד — ההעברה מתבצעת באתר ובדרייב.</> : <>{dialog.files.length} קבצים נבחרו. בחרי תיקיית יעד — ההעברה מתבצעת באתר ובדרייב.</>}
          ix={ix}
          current={view?.categoryId ?? null}
          submitLabel="העבר"
          onClose={() => setDialog(null)}
          onSubmit={(t) => (t == null ? Promise.resolve("בחרי תיקיית יעד") : doMoveFiles(dialog.files.map((f) => f.id), t))}
        />
      )}
      {dialog?.t === "moveFolder" && ix && (
        <MovePickerDialog
          title="העבר תיקייה ל…"
          subtitle={<>התיקייה ‘<bdi>{dialog.node.title}</bdi>’ (וכל מה שבתוכה) תועבר באתר ובדרייב. אחרי העברה קבועה כדאי לעדכן גם את scripts/curriculum-tree.ts, כדי שהרצה חוזרת של seed לא תחזיר את התיקייה למקומה.</>}
          ix={ix}
          current={dialog.node.parentId}
          disabled={new Set((tree ?? []).filter((n) => isSelfOrDescendant(ix, dialog.node.id, n.id)).map((n) => n.id))}
          disabledReason="אי אפשר להעביר תיקייה אל תוך עצמה או אל תת-תיקייה שלה"
          allowRoot={dialog.node.parentId !== null}
          submitLabel="העבר תיקייה"
          onClose={() => setDialog(null)}
          onSubmit={(t) => doMoveFolders([dialog.node.id], t)}
        />
      )}
      {dialog?.t === "restore" && ix && (
        <MovePickerDialog
          title="שחזור — בחירת תיקיית יעד"
          subtitle={<>{dialog.items.filter((i) => i.materialId == null).length} מהקבצים הם יתומים (אין להם חומר באתר), ולכן צריך לבחור תיקייה שאליה יצורפו כחומרי טיוטה.{dialog.items.some((i) => i.materialId != null) ? " הקבצים המקושרים יחזרו לקטגוריה המקורית שלהם." : ""}</>}
          ix={ix}
          submitLabel="שחזר"
          onClose={() => setDialog(null)}
          onSubmit={(t) => (t == null ? Promise.resolve("בחרי תיקיית יעד") : doRestore(dialog.items, t))}
        />
      )}
      {dialog?.t === "rename" && (
        <RenameDialog
          kind="file"
          current={dialog.file.fileName}
          originalName={dialog.file.originalName}
          onClose={() => setDialog(null)}
          onSubmit={(name) => perform(() => renameMaterialAction(dialog.file.id, name), { ok: () => "השם שונה באתר ובדרייב; השם הישן נשמר בהיסטוריה" })}
        />
      )}
      {dialog?.t === "renameFolder" && (
        <RenameDialog
          kind="folder"
          current={dialog.node.title}
          onClose={() => setDialog(null)}
          onSubmit={(name) => perform(() => renameCategoryAction(dialog.node.id, name), { ok: () => "שם התיקייה שונה באתר ובדרייב" })}
        />
      )}
      {dialog?.t === "history" && (
        <HistoryDialog
          target={dialog.file ? { materialId: dialog.file.id } : { categoryId: dialog.node!.id }}
          title={dialog.file ? <><bdi>{dialog.file.fileName}</bdi></> : <>תיקייה: <bdi>{dialog.node!.title}</bdi></>}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.t === "archive" && (
        <ArchiveDialog
          names={dialog.files.map((f) => f.fileName)}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => doArchive(dialog.files.map((f) => f.id), reason)}
        />
      )}
      {dialog?.t === "newFolder" && (
        <NewFolderDialog
          isRoot={curId == null}
          parentTitle={view?.title ?? ""}
          onClose={() => setDialog(null)}
          onSubmit={async (title) => {
            const err = await perform(() => createFolderAction(curId, title), { ok: () => `נוצרה התיקייה ״${title}״ באתר ובדרייב (כטיוטה)` });
            if (curId != null) setExpanded((s) => new Set([...s, curId]));
            return err;
          }}
        />
      )}
      {dialog?.t === "sync" && (
        <SyncDialog
          folderTitle={view?.title ?? ""}
          onClose={() => setDialog(null)}
          onPick={(scope) => {
            setDialog(null);
            void runSync(scope);
          }}
        />
      )}

      {/* רמז גרירה */}
      {dragActive && (
        <div className="toasts" aria-hidden>
          <div className={`toast ${hover && !hover.verdict.ok ? "err" : ""}`}>
            {hover ? (hover.verdict.ok ? <>שחררי כדי להעביר אל <b>{hover.label}</b></> : <>{hover.verdict.reason}</>) : "גררי אל תיקייה בעץ (או לשורה של תיקייה)"}
          </div>
        </div>
      )}

      {/* טוסטים */}
      <div className="toasts" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "err" ? "err" : ""}`} role={t.tone === "err" ? "alert" : undefined}>
            {t.tone === "err" ? <TriangleAlert className="ic" aria-hidden /> : <CheckCircle2 className="ic" aria-hidden />}
            <span>{t.msg}</span>
            <button type="button" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} aria-label="סגירת הודעה">סגירה</button>
          </div>
        ))}
      </div>
    </div>
  );
}
