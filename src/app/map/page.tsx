import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, FolderTree } from "lucide-react";
import { getRootSubjects, getVisibleChildren } from "@/lib/data";
import type { Category } from "@/db/schema";
import { AnimatedGrid } from "@/components/animated-grid";
import { BagrutMapTree, type MapNode } from "@/components/bagrut-map-tree";

export const metadata: Metadata = { title: "מפת הבגרות המלאה" };
export const dynamic = "force-dynamic";

async function buildTree(depth: number): Promise<MapNode[]> {
  try {
    const roots = await getRootSubjects();
    const expand = async (cat: Category, chain: Category[], level: number): Promise<MapNode> => {
      const me = [...chain, cat];
      if (level >= depth) return { cat, chain: me, children: [] };
      const kids = await getVisibleChildren(cat.id, false).catch(() => []);
      const children = await Promise.all(kids.map((k) => expand(k, me, level + 1)));
      return { cat, chain: me, children };
    };
    return Promise.all(roots.map((r) => expand(r, [], 0)));
  } catch {
    return [];
  }
}

export default async function MapPage() {
  const tree = await buildTree(7);

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
