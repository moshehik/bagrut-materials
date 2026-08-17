"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronLeft, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteCategory } from "@/lib/actions/admin";
import { formatPrice } from "@/lib/constants";
import { CategoryForm } from "./category-form";

export type TreeNode = {
  id: number;
  parentId: number | null;
  slug: string;
  title: string;
  description: string | null;
  questionnaireCode: string | null;
  icon: string | null;
  color: string | null;
  sort: number;
  bundlePrice: number | null;
  materialsCount: number;
  children: TreeNode[];
};

function subtreeMaterials(n: TreeNode): number {
  return n.materialsCount + n.children.reduce((s, c) => s + subtreeMaterials(c), 0);
}

export function CategoryTree({ roots }: { roots: TreeNode[] }) {
  if (roots.length === 0) {
    return (
      <div className="card p-8 text-center text-muted">
        עדיין אין קטגוריות. הוסיפי מקצוע ראשון למעלה, או הריצי{" "}
        <code className="font-mono text-xs bg-oak-soft px-1 rounded">npm run db:seed</code>.
      </div>
    );
  }
  return (
    <div className="card p-3 sm:p-4">
      <ul className="space-y-1">
        {roots.map((n) => (
          <Node key={n.id} node={n} depth={0} />
        ))}
      </ul>
    </div>
  );
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const [mode, setMode] = useState<"none" | "edit" | "add">("none");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const hasChildren = node.children.length > 0;
  const total = subtreeMaterials(node);

  const onDelete = () => {
    const msg =
      `למחוק את "${node.title}"?` +
      (hasChildren ? `\nיימחקו גם ${countNodes(node) - 1} תת-קטגוריות` : "") +
      (total ? `\nו-${total} חומרים!` : "");
    if (!confirm(msg)) return;
    startTransition(async () => {
      const r = await deleteCategory(node.id);
      if (r?.error) setErr(r.error);
    });
  };

  return (
    <li>
      <div
        className={`group flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-oak-soft/40 ${
          depth === 0 ? "bg-blue-soft/40" : ""
        }`}
        style={{ marginInlineStart: depth * 18 }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`grid place-items-center h-6 w-6 rounded-md ${
            hasChildren ? "hover:bg-white text-foreground" : "text-transparent"
          }`}
          aria-label={open ? "כיווץ" : "הרחבה"}
          disabled={!hasChildren}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        <span className="text-lg leading-none">{node.icon ?? (depth === 0 ? "📁" : "")}</span>
        <span className="font-semibold">{node.title}</span>
        <span className="font-mono text-[11px] text-muted" dir="ltr">
          /{node.slug}
        </span>
        {node.questionnaireCode && (
          <span className="chip bg-gold-soft text-gold font-mono" dir="ltr">
            {node.questionnaireCode}
          </span>
        )}
        {node.bundlePrice !== null && (
          <span className="chip bg-pink-soft text-pink">תיקייה {formatPrice(node.bundlePrice)}</span>
        )}
        <span className="chip bg-blue-soft text-blue-deep" title="חומרים בקטגוריה (ובכל העץ)">
          📎 {node.materialsCount}
          {total !== node.materialsCount && <span className="opacity-60">/ {total}</span>}
        </span>
        <span className="text-[11px] text-muted">סדר {node.sort}</span>

        <span className="ms-auto flex items-center gap-1 opacity-70 group-hover:opacity-100">
          <Link
            href={`/admin/materials?category=${node.id}`}
            className="btn btn-ghost text-xs py-1 px-2.5"
            title="פתחי חומרים"
          >
            <FolderOpen className="h-3.5 w-3.5" /> חומרים
          </Link>
          <button
            type="button"
            className="btn btn-ghost text-xs py-1 px-2.5"
            onClick={() => setMode(mode === "add" ? "none" : "add")}
          >
            <Plus className="h-3.5 w-3.5" /> תת-קטגוריה
          </button>
          <button
            type="button"
            className="btn btn-ghost text-xs py-1 px-2.5"
            onClick={() => setMode(mode === "edit" ? "none" : "edit")}
          >
            <Pencil className="h-3.5 w-3.5" /> עריכה
          </button>
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 text-red-700 border border-red-200 hover:bg-red-50"
            onClick={onDelete}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" /> {pending ? "מוחקת…" : "מחיקה"}
          </button>
        </span>
        {err && <span className="w-full text-xs text-red-600">{err}</span>}
      </div>

      {mode !== "none" && (
        <div
          className="my-2 rounded-xl border border-oak/30 bg-white p-4 shadow-soft"
          style={{ marginInlineStart: depth * 18 + 32 }}
        >
          <h4 className="font-bold mb-3">
            {mode === "edit" ? `עריכת "${node.title}"` : `תת-קטגוריה חדשה תחת "${node.title}"`}
          </h4>
          {mode === "edit" ? (
            <CategoryForm
              mode="edit"
              parentId={node.parentId}
              initial={node}
              onDone={() => setMode("none")}
            />
          ) : (
            <CategoryForm
              mode="create"
              parentId={node.id}
              onDone={() => {
                setMode("none");
                setOpen(true);
              }}
            />
          )}
        </div>
      )}

      {open && hasChildren && (
        <ul className="space-y-1">
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function countNodes(n: TreeNode): number {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}
