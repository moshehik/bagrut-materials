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
}: {
  node: MapNode;
  level: number;
  accent: string;
  open: boolean;
  onToggle: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const style = { "--flow-accent": accent } as CSSProperties;
  const boxClass = `flow-node ${level % 2 === 1 ? "flow-node--alt" : ""} inline-flex max-w-[17rem] items-center gap-1.5 px-3.5 py-2 text-ink ${
    level === 0 ? "text-2xl" : "text-lg"
  } ${hasChildren ? "cursor-pointer" : ""}`;

  return (
    <div
      className={boxClass}
      style={style}
      onClick={hasChildren ? onToggle : undefined}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-start"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
          <span className="min-w-0 leading-tight">{node.cat.title}</span>
        </button>
      ) : (
        <span className="min-w-0 flex-1 leading-tight">{node.cat.title}</span>
      )}
      {node.cat.questionnaireCode && (
        <span className="shrink-0 self-center rounded-full border border-ink/40 px-2 text-sm leading-snug opacity-80">
          {node.cat.questionnaireCode}
        </span>
      )}
      <Link
        href={hrefFor(node.chain)}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded-full p-1 opacity-60 hover:opacity-100"
        title="לפתיחת דף התיקייה"
        aria-label={`פתיחת דף ${node.cat.title}`}
      >
        <ArrowUpLeft className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

/** ענף רקורסיבי: צומת מימין, קו מחבר, וילדים משמאל — רק כשהצומת פתוח */
function Branch({ node, level, accent }: { node: MapNode; level: number; accent: string }) {
  const [open, setOpen] = useState(level === 0);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex items-start">
      <div className="flex flex-col gap-1.5">
        <NodeBox node={node} level={level} accent={accent} open={open} onToggle={() => setOpen((o) => !o)} />
        {open && node.cat.description && (
          <p className="max-w-[17rem] text-[11px] leading-relaxed text-muted">{node.cat.description}</p>
        )}
      </div>

      {open && hasChildren && (
        <>
          <span aria-hidden className="mt-5 h-px w-7 shrink-0 bg-ink/50" />
          <ul className="flex flex-col gap-3">
            {node.children.map((child) => (
              <li
                key={child.cat.id}
                className="relative flex items-start ps-7 before:absolute before:right-0 before:top-0 before:bottom-0 before:w-px before:bg-ink/50 first:before:top-5 last:before:bottom-[calc(100%-1.25rem)] after:absolute after:right-0 after:top-5 after:h-px after:w-7 after:-translate-y-1/2 after:bg-ink/50"
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
