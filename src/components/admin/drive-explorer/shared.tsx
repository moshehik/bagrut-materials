"use client";

import type { ReactNode } from "react";
import {
  ClipboardList,
  FileCheck2,
  FileQuestion,
  FileText,
  Presentation,
  Star,
  FileType,
} from "lucide-react";
import type { ExplorerFile, TreeNode } from "@/lib/actions/driveExplorer";
import type { ArchiveKind } from "@/lib/driveTreeCore";

/* ---------------- מיקום נוכחי ---------------- */

export type Loc = { t: "cat"; id: number | null } | { t: "arch"; sub: ArchiveKind | null };

export const ARCHIVE_KINDS: ArchiveKind[] = ["orphans", "oldVersions", "unclear"];
export const ARCHIVE_LABEL: Record<ArchiveKind, string> = {
  orphans: "יתומים",
  oldVersions: "גרסאות ישנות",
  unclear: "לא ברור",
};
export const ARCHIVE_HINT: Record<ArchiveKind, string> = {
  orphans: "קבצים בדרייב שאין להם שורה באתר",
  oldVersions: "הוחלפו בגרסה חדשה",
  unclear: "ממתינים להחלטה",
};

export const sameLoc = (a: Loc, b: Loc) =>
  a.t === b.t && (a.t === "cat" ? a.id === (b as typeof a).id : a.sub === (b as typeof a).sub);

/* ---------------- עץ ---------------- */

export type TreeIndex = {
  byId: Map<number, TreeNode>;
  children: Map<number | null, TreeNode[]>;
};

export function indexTree(nodes: TreeNode[]): TreeIndex {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<number | null, TreeNode[]>();
  for (const n of nodes) {
    const k = byId.has(n.parentId as number) ? n.parentId : null;
    children.set(k, [...(children.get(k) ?? []), n]);
  }
  return { byId, children };
}

/** האם `node` הוא `anc` עצמו או צאצא שלו. */
export function isSelfOrDescendant(ix: TreeIndex, anc: number, node: number | null): boolean {
  let cur: number | null = node;
  let guard = 0;
  while (cur != null && guard++ < 60) {
    if (cur === anc) return true;
    cur = ix.byId.get(cur)?.parentId ?? null;
  }
  return false;
}

export function ancestorsOf(ix: TreeIndex, id: number | null): number[] {
  const out: number[] = [];
  let cur = id != null ? ix.byId.get(id)?.parentId ?? null : null;
  let guard = 0;
  while (cur != null && guard++ < 60) {
    out.push(cur);
    cur = ix.byId.get(cur)?.parentId ?? null;
  }
  return out;
}

export function pathTitles(ix: TreeIndex, id: number | null): string {
  const names: string[] = [];
  let cur: number | null = id;
  let guard = 0;
  while (cur != null && guard++ < 60) {
    const n = ix.byId.get(cur);
    if (!n) break;
    names.unshift(n.title);
    cur = n.parentId;
  }
  return names.join(" › ");
}

/* ---------------- סוגי קבצים וסטטוס ---------------- */

export const CORE_LABEL: Record<string, string> = {
  teacher: "דף למורה",
  student: "דף לתלמידה",
  quiz: "בוחן",
  quizAnswers: "בוחן עם תשובות",
  enrichment: "דף העשרה",
  summary: "סיכום להכתבה",
  skills: "מיומנויות וחווית למידה",
};
const KIND_LABEL: Record<string, string> = {
  teacher_sheet: "דף למורה",
  student_sheet: "דף לתלמידה",
  presentation: "מצגת",
  past_exam: "בגרות",
  tips: "טיפים",
  ideas: "רעיונות",
  other: "לא מסווג",
};

export function kindInfo(f: Pick<ExplorerFile, "coreType" | "kind">): { label: string; cls: string; icon: ReactNode } {
  const ic = "ic";
  if (f.coreType) {
    const icon =
      f.coreType === "quiz" ? <FileQuestion className={ic} aria-hidden /> :
      f.coreType === "quizAnswers" ? <FileCheck2 className={ic} aria-hidden /> :
      f.coreType === "enrichment" ? <Star className={ic} aria-hidden /> :
      f.coreType === "summary" ? <ClipboardList className={ic} aria-hidden /> :
      <FileText className={ic} aria-hidden />;
    return { label: CORE_LABEL[f.coreType] ?? f.coreType, cls: `k-${f.coreType}`, icon };
  }
  if (f.kind === "presentation") return { label: "מצגת", cls: "k-slides", icon: <Presentation className={ic} aria-hidden /> };
  if (f.kind === "past_exam") return { label: "בגרות", cls: "k-bagrut", icon: <FileText className={ic} aria-hidden /> };
  return { label: KIND_LABEL[f.kind] ?? "לא מסווג", cls: "k-other", icon: <FileType className={ic} aria-hidden /> };
}

export const STATUS_LABEL: Record<string, string> = { draft: "טיוטה", active: "פעיל", suspended: "מושהה" };

/* ---------------- עיצוב ---------------- */

const TZ = "Asia/Jerusalem";
export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleString("he-IL", withTime ? { timeZone: TZ, dateStyle: "short", timeStyle: "short" } : { timeZone: TZ, dateStyle: "short" });
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - +new Date(iso);
  if (Number.isNaN(diff)) return "";
  const days = Math.floor(diff / 864e5);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 30) return `לפני ${days} ימים`;
  const m = Math.floor(days / 30);
  return m === 1 ? "לפני חודש" : `לפני ${m} חודשים`;
}

export function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** שם קובץ עם סיומת מבודדת (LTR) כדי שלא תתהפך בשורת RTL. */
export function NameWithExt({ name }: { name: string }) {
  const m = name.match(/^(.*?)(\.[A-Za-z0-9]{2,5})$/);
  if (!m) return <>{name}</>;
  return (
    <>
      {m[1]}
      <span className="ext">{m[2]}</span>
    </>
  );
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------------- גרירה ---------------- */

export type DragPayload = { files: number[]; folders: number[] };
export type DropTarget = { kind: "cat"; id: number | null } | { kind: "arch" };
export type DropVerdict = { ok: true } | { ok: false; reason: string };

/* ---------------- טוסטים ---------------- */

export type ToastItem = { id: number; tone: "ok" | "err" | "info"; msg: string };

/* ---------------- ציר זמן להיסטוריה ---------------- */

export function eventText(e: { kind: string; oldValue: string | null; newValue: string | null }): { cls: string; node: ReactNode } {
  const b = (s: string | null) => <bdi>{s ? <NameWithExt name={s} /> : "—"}</bdi>;
  switch (e.kind) {
    case "file.add":
      return { cls: "add", node: <>נוסף לאתר ולדרייב: {b(e.newValue)}</> };
    case "file.rename":
    case "folder.rename":
      return { cls: "rename", node: <>שונה מ-{b(e.oldValue)} ל-{b(e.newValue)}</> };
    case "file.move":
    case "folder.move":
      return { cls: "move", node: <>הועבר לתיקייה אחרת בדרייב{e.newValue ? <> <span className="mono">({e.newValue.slice(0, 8)}…)</span></> : null}</> };
    case "file.archive":
      return { cls: "archive", node: <>הועבר לארכיון{e.newValue ? ` (${e.newValue})` : ""}</> };
    case "file.restore":
      return { cls: "restore", node: <>שוחזר מהארכיון</> };
    case "folder.create":
      return { cls: "add", node: <>נוצרה תיקייה {b(e.newValue)}</> };
    case "info.update":
      return { cls: "add", node: <>קובץ המידע הועלה/עודכן בדרייב</> };
    default:
      return { cls: "add", node: <>{e.kind}</> };
  }
}
