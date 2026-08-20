"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ArrowUpLeft } from "lucide-react";
import { SUBJECT_ICONS } from "@/lib/constants";
import type { Category } from "@/db/schema";

export type MapNode = { cat: Category; chain: Category[]; children: MapNode[] };

function hrefFor(chain: Category[]) {
  return "/subjects/" + chain.map((c) => encodeURIComponent(c.slug)).join("/");
}

const LEVEL_STYLE = [
  "bg-gradient-to-br from-blue to-blue-deep text-white shadow-lg shadow-blue/30 border-transparent",
  "bg-white border-pink/50 text-foreground shadow-soft",
  "bg-white border-gold/60 text-foreground",
  "bg-white border-oak/50 text-foreground",
  "bg-white border-blue/40 text-foreground",
  "bg-white border-pink/30 text-foreground",
];

/** צומת-קופסה בסגנון תרשים זרימה: לחיצה על תוכן הקופסה פותחת/סוגרת את הענף */
function NodeBox({ node, level, open, onToggle }: { node: MapNode; level: number; open: boolean; onToggle: () => void }) {
  const hasChildren = node.children.length > 0;
  const icon = node.cat.icon || (level === 0 ? SUBJECT_ICONS[node.cat.slug] || "📘" : null);
  const style = LEVEL_STYLE[Math.min(level, LEVEL_STYLE.length - 1)];
  const mutedChip = level === 0 ? "bg-white/20 text-white" : "bg-black/5 text-current opacity-80";

  return (
    <div
      className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-2xl border px-3 py-2.5 transition-transform hover:scale-[1.03] hover:shadow-lift ${style} ${
        level === 0 ? "text-base" : "text-sm"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasChildren}
        aria-expanded={hasChildren ? open : undefined}
        className={`flex min-w-0 flex-1 items-center gap-1.5 text-start font-semibold ${
          hasChildren ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {hasChildren ? (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}
        {icon && (
          <span className="shrink-0" aria-hidden>
            {icon}
          </span>
        )}
        <span className="min-w-0 truncate leading-tight">{node.cat.title}</span>
      </button>
      {node.cat.questionnaireCode && (
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${mutedChip}`}>
          {node.cat.questionnaireCode}
        </span>
      )}
      <Link
        href={hrefFor(node.chain)}
        className={`shrink-0 rounded-full p-1 ${level === 0 ? "hover:bg-white/20" : "hover:bg-black/5"}`}
        title="לפתיחת הדף"
        aria-label={`פתיחת ${node.cat.title}`}
      >
        <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/** ענף רקורסיבי: צומת מימין, קו מחבר, וילדים משמאל — רק כשהצומת פתוח */
function Branch({ node, level }: { node: MapNode; level: number }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex items-start">
      <div className="flex flex-col gap-1.5">
        <NodeBox node={node} level={level} open={open} onToggle={() => setOpen((o) => !o)} />
        {open && node.cat.description && (
          <p className="max-w-[16rem] text-[11px] leading-relaxed text-muted">{node.cat.description}</p>
        )}
      </div>

      {open && hasChildren && (
        <>
          <span aria-hidden className="mt-5 h-0.5 w-6 shrink-0 bg-blue/30" />
          <ul className="flex flex-col gap-3">
            {node.children.map((child) => (
              <li
                key={child.cat.id}
                className="relative flex items-start ps-6 before:absolute before:right-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-blue/30 first:before:top-5 last:before:bottom-[calc(100%-1.25rem)] after:absolute after:right-0 after:top-5 after:h-0.5 after:w-6 after:-translate-y-1/2 after:bg-blue/30"
              >
                <Branch node={child} level={level + 1} />
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
    <div className="flex flex-col gap-6 overflow-x-auto">
      {tree.map((root) => (
        <div key={root.cat.id} className="min-w-max">
          <Branch node={root} level={0} />
        </div>
      ))}
    </div>
  );
}
