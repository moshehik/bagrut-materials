import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, FolderTree, ChevronDown, ArrowUpLeft } from "lucide-react";
import { getAllActiveCategories } from "@/lib/data";
import type { Category } from "@/db/schema";
import { AnimatedGrid } from "@/components/animated-grid";
import { BagrutMapTree, type MapNode } from "@/components/bagrut-map-tree";

export const metadata: Metadata = { title: "מפת הבגרות המלאה" };
export const dynamic = "force-dynamic";

async function buildTree(): Promise<MapNode[]> {
  try {
    // שאילתה אחת לכל הקטגוריות; הרכבת העץ בזיכרון (רקורסיה לפי parentId)
    const all = await getAllActiveCategories();
    const byParent = new Map<number | null, Category[]>();
    for (const cat of all) {
      const list = byParent.get(cat.parentId) ?? [];
      list.push(cat);
      byParent.set(cat.parentId, list);
    }
    const expand = (cat: Category, chain: Category[]): MapNode => {
      const me = [...chain, cat];
      const kids = byParent.get(cat.id) ?? [];
      return { cat, chain: me, children: kids.map((k) => expand(k, me)) };
    };
    return (byParent.get(null) ?? []).map((r) => expand(r, []));
  } catch (e) {
    console.error("bagrut map: failed to build tree", e);
    return [];
  }
}

export default async function MapPage() {
  const tree = await buildTree();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-display text-4xl font-black">
            <GitBranch className="inline h-8 w-8 text-pink me-2" aria-hidden />
            מפת הבגרות המלאה
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            תרשים זרימה של כל המקצועות: מקצוע ← יחידות ← פנימי/חיצוני ← הערכה בית ספרית/חלופית ←
            נושאים ופרקים. לחצי על צומת כדי לפתוח את הענף שלו.
          </p>
        </div>
        <Link href="/subjects" className="btn btn-ghost text-sm">
          <FolderTree className="h-4 w-4" aria-hidden /> לצפייה לפי תיקיות
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-ink/15 bg-plaster px-4 py-3 text-sm text-muted animate-fade-up">
        <span className="flex items-center gap-1.5">
          <ChevronDown className="h-4 w-4 shrink-0 text-ink/70" aria-hidden />
          לחיצה על <b className="text-ink">הריבוע עצמו</b> פותחת את הריבוע הבא
        </span>
        <span className="flex items-center gap-1.5">
          <ArrowUpLeft className="h-4 w-4 shrink-0" style={{ color: "var(--flow-final)" }} aria-hidden />
          לחיצה על <b className="text-ink">החץ</b> מביאה אל המקור עצמו
        </span>
      </div>

      {tree.length === 0 ? (
        <div className="card mt-10 p-12 text-center">
          <div className="text-6xl animate-float">🗺️</div>
          <h2 className="mt-4 text-2xl font-bold">המפה עדיין ריקה</h2>
          <p className="mt-2 text-muted">ברגע שיתווספו מקצועות – הם יופיעו כאן.</p>
        </div>
      ) : (
        <AnimatedGrid className="mt-8">
          <div className="card p-5">
            <BagrutMapTree tree={tree} />
          </div>
        </AnimatedGrid>
      )}
    </div>
  );
}
