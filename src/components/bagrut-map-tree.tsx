"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown, ArrowUpLeft, Undo2 } from "lucide-react";
import { SUBJECT_COLORS } from "@/lib/constants";
import type { Category } from "@/db/schema";

export type MapNode = { cat: Category; chain: Category[]; children: MapNode[] };

function hrefFor(chain: Category[]) {
  return "/subjects/" + chain.map((c) => encodeURIComponent(c.slug)).join("/");
}

/** צומת הפניה: מפנה לפירוט שנמצא במקום אחר בתרשים (למשל "החומר המשותף עם 3 יחידות") */
const REF_PREFIX = "same-as-";
const isRefNode = (node: MapNode) => node.cat.slug.startsWith(REF_PREFIX);

type TreeCtx = {
  isOpen: (id: number) => boolean;
  toggle: (id: number) => void;
  gotoRef: (node: MapNode) => void;
  resolveRef: (node: MapNode) => MapNode | null;
};

/**
 * צומת בסגנון משורטט: מלבן שקוף בקו דיו, כתב-יד, נצבע בריחוף.
 * לחיצה בכל מקום על הקופסה פותחת/סוגרת את הענף — לעולם אינה מנווטת.
 * רק החץ הקטן פותח את דף התיקייה (גם בצומת סופי).
 * צומת הפניה (slug שמתחיל ב-same-as-) קופץ אל הפירוט שאליו הוא מפנה.
 */
function NodeBox({
  node,
  level,
  accent,
  open,
  onToggle,
  compact = false,
  ctx,
}: {
  node: MapNode;
  level: number;
  accent: string;
  open?: boolean;
  onToggle?: () => void;
  compact?: boolean;
  ctx: TreeCtx;
}) {
  const hasChildren = node.children.length > 0;
  const ref = isRefNode(node);
  const refTarget = ref ? ctx.resolveRef(node) : null;
  const style = { "--flow-accent": accent } as CSSProperties;
  const size = compact
    ? "px-2 py-0.5 text-sm max-w-[14rem]"
    : level === 0
      ? "px-3.5 py-2 text-xl max-w-[15rem]"
      : "px-2.5 py-1 text-base max-w-[14rem]";
  const boxClass = `flow-node ${level % 2 === 1 ? "flow-node--alt" : ""} ${
    ref ? "flow-node--ref" : ""
  } inline-flex items-center gap-1.5 text-ink ${size} ${hasChildren || ref ? "cursor-pointer" : ""}`;

  const clickAction = ref ? () => ctx.gotoRef(node) : hasChildren ? onToggle : undefined;

  return (
    <div className={boxClass} style={style} onClick={clickAction}>
      {hasChildren || ref ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            clickAction?.();
          }}
          aria-expanded={ref ? undefined : open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-start"
        >
          {ref ? (
            <Undo2 className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          ) : (
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          )}
          <span className="min-w-0 leading-tight">{node.cat.title}</span>
        </button>
      ) : (
        <span className="min-w-0 flex-1 leading-tight">{node.cat.title}</span>
      )}
      {node.cat.questionnaireCode && (
        <span className="shrink-0 self-center rounded-full border border-ink/40 px-1.5 text-xs leading-snug opacity-80">
          {node.cat.questionnaireCode}
        </span>
      )}
      <Link
        href={hrefFor(refTarget ? refTarget.chain : node.chain)}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100"
        title="לפתיחת דף התיקייה"
        aria-label={`פתיחת דף ${node.cat.title}`}
      >
        <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * ענף רקורסיבי: צומת מימין, קו מחבר, וילדים משמאל — רק כשהצומת פתוח.
 * כשכל הילדים הם צמתים סופיים (פרקים/סימנים/יצירות) — הם יורדים למטה,
 * כל פרק בשורה נפרדת, במקום להתרחב עוד שמאלה.
 */
function Branch({ node, level, accent, ctx }: { node: MapNode; level: number; accent: string; ctx: TreeCtx }) {
  const open = ctx.isOpen(node.cat.id);
  const hasChildren = node.children.length > 0;
  const allLeaves = hasChildren && node.children.every((c) => c.children.length === 0);

  return (
    <div className="flex items-start">
      <div id={`map-cat-${node.cat.id}`} className="flex flex-col items-start gap-1">
        <NodeBox
          node={node}
          level={level}
          accent={accent}
          open={open}
          onToggle={() => ctx.toggle(node.cat.id)}
          ctx={ctx}
        />
        {open && node.cat.description && (
          <p className="max-w-[15rem] text-[11px] leading-relaxed text-muted">{node.cat.description}</p>
        )}
        {open && allLeaves && (
          <div className="flex flex-col">
            <span aria-hidden className="ms-6 h-3 w-px bg-ink/50" />
            <div className="flex flex-col items-start gap-1 ps-4">
              {node.children.map((child) => (
                <NodeBox
                  key={child.cat.id}
                  node={child}
                  level={level + 1}
                  accent={child.cat.color || accent}
                  compact
                  ctx={ctx}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {open && hasChildren && !allLeaves && (
        <>
          <span aria-hidden className="mt-4 h-px w-4 shrink-0 bg-ink/50" />
          <ul className="flex flex-col gap-2.5">
            {node.children.map((child) => (
              <li
                key={child.cat.id}
                className="relative flex items-start ps-4 before:absolute before:right-0 before:top-0 before:bottom-0 before:w-px before:bg-ink/50 first:before:top-4 last:before:bottom-[calc(100%-1rem)] after:absolute after:right-0 after:top-4 after:h-px after:w-4 after:-translate-y-1/2 after:bg-ink/50"
              >
                <Branch node={child} level={level + 1} accent={child.cat.color || accent} ctx={ctx} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function BagrutMapTree({ tree }: { tree: MapNode[] }) {
  // מקצוע שכל בניו סופיים (למשל אנגלית, אזרחות) מתחיל סגור — הפירוט רק בלחיצה
  const [openIds, setOpenIds] = useState<Set<number>>(
    () =>
      new Set(
        tree
          .filter((r) => r.children.length > 0 && !r.children.every((c) => c.children.length === 0))
          .map((r) => r.cat.id),
      ),
  );

  const bySlugInRoot = useMemo(() => {
    const map = new Map<string, MapNode>();
    const walk = (n: MapNode, rootId: number) => {
      map.set(`${rootId}:${n.cat.slug}`, n);
      n.children.forEach((c) => walk(c, rootId));
    };
    tree.forEach((r) => walk(r, r.cat.id));
    return map;
  }, [tree]);

  const resolveRef = (node: MapNode): MapNode | null => {
    const targetSlug = node.cat.slug.slice(REF_PREFIX.length);
    const rootId = node.chain[0].id;
    return bySlugInRoot.get(`${rootId}:${targetSlug}`) ?? null;
  };

  const gotoRef = (node: MapNode) => {
    const target = resolveRef(node);
    if (!target) return;
    setOpenIds((prev) => new Set([...prev, ...target.chain.map((c) => c.id)]));
    setTimeout(() => {
      const el = document.getElementById(`map-cat-${target.cat.id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      el.classList.add("flow-flash");
      setTimeout(() => el.classList.remove("flow-flash"), 1800);
    }, 80);
  };

  const ctx: TreeCtx = {
    isOpen: (id) => openIds.has(id),
    toggle: (id) =>
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    gotoRef,
    resolveRef,
  };

  return (
    <div className="flex flex-col gap-8 overflow-x-auto py-2">
      {tree.map((root) => (
        <div key={root.cat.id} className="min-w-max">
          <Branch
            node={root}
            level={0}
            accent={SUBJECT_COLORS[root.cat.slug] || root.cat.color || "var(--sun)"}
            ctx={ctx}
          />
        </div>
      ))}
    </div>
  );
}
