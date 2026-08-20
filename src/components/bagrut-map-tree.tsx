"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown, ArrowUpLeft } from "lucide-react";
import type { Category } from "@/db/schema";

export type MapNode = { cat: Category; chain: Category[]; children: MapNode[] };

function hrefFor(chain: Category[]) {
  return "/subjects/" + chain.map((c) => encodeURIComponent(c.slug)).join("/");
}

/**
 * צומת בסגנון משורטט: מלבן שקוף בקו דיו, כתב-יד, נצבע בריחוף.
 * לחיצה בכל מקום על הקופסה פותחת/סוגרת את הענף — לעולם אינה מנווטת.
 * רק החץ הקטן פותח את דף התיקייה (גם בצומת סופי).
 */
function NodeBox({
  node,
  level,
  accent,
  open,
  onToggle,
  compact = false,
}: {
  node: MapNode;
  level: number;
  accent: string;
  open?: boolean;
  onToggle?: () => void;
  compact?: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const style = { "--flow-accent": accent } as CSSProperties;
  const size = compact
    ? "px-2 py-0.5 text-sm max-w-[14rem]"
    : level === 0
      ? "px-3.5 py-2 text-xl max-w-[15rem]"
      : "px-2.5 py-1 text-base max-w-[14rem]";
  const boxClass = `flow-node ${level % 2 === 1 ? "flow-node--alt" : ""} inline-flex items-center gap-1.5 text-ink ${size} ${
    hasChildren ? "cursor-pointer" : ""
  }`;

  return (
    <div className={boxClass} style={style} onClick={hasChildren ? onToggle : undefined}>
      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-start"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
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
        href={hrefFor(node.chain)}
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
 * כשכל הילדים הם צמתים סופיים (פרקים/סימנים) — הם יורדים למטה בשורות
 * עטופות במקום להתרחב עוד שמאלה, כדי שהתרשים לא יגלוש מהמסך.
 */
function Branch({ node, level, accent }: { node: MapNode; level: number; accent: string }) {
  const [open, setOpen] = useState(level === 0);
  const hasChildren = node.children.length > 0;
  const allLeaves = hasChildren && node.children.every((c) => c.children.length === 0);

  return (
    <div className="flex items-start">
      <div className="flex flex-col gap-1.5">
        <NodeBox node={node} level={level} accent={accent} open={open} onToggle={() => setOpen((o) => !o)} />
        {open && node.cat.description && (
          <p className="max-w-[17rem] text-[11px] leading-relaxed text-muted">{node.cat.description}</p>
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
                <Branch node={child} level={level + 1} accent={child.cat.color || accent} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function BagrutMapTree({ tree }: { tree: MapNode[] }) {
  return (
    <div className="flex flex-col gap-8 overflow-x-auto py-2">
      {tree.map((root) => (
        <div key={root.cat.id} className="min-w-max">
          <Branch node={root} level={0} accent={root.cat.color || "var(--sun)"} />
        </div>
      ))}
    </div>
  );
}
