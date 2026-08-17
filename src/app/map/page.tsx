import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, FolderTree } from "lucide-react";
import { getRootSubjects, getChildren, chainToHref } from "@/lib/data";
import { SUBJECT_ICONS } from "@/lib/constants";
import type { Category } from "@/db/schema";
import { AnimatedGrid } from "@/components/animated-grid";

export const metadata: Metadata = { title: "מפת הבגרות המלאה" };
export const dynamic = "force-dynamic";

type Node = { cat: Category; chain: Category[]; children: Node[] };

async function buildTree(depth: number): Promise<Node[]> {
  try {
    const roots = await getRootSubjects();
    const expand = async (cat: Category, chain: Category[], level: number): Promise<Node> => {
      const me = [...chain, cat];
      if (level >= depth) return { cat, chain: me, children: [] };
      const kids = await getChildren(cat.id).catch(() => []);
      const children = await Promise.all(kids.map((k) => expand(k, me, level + 1)));
      return { cat, chain: me, children };
    };
    return Promise.all(roots.map((r) => expand(r, [], 0)));
  } catch {
    return [];
  }
}

const LEVEL_STYLE = [
  "bg-gradient-to-br from-blue to-blue-deep text-white shadow-lg shadow-blue/30",
  "bg-white border border-pink/40 text-foreground shadow-soft",
  "bg-white border border-gold/50 text-foreground",
  "bg-white border border-oak/40 text-foreground",
];

function NodeBox({ node, level }: { node: Node; level: number }) {
  const icon = node.cat.icon || (level === 0 ? SUBJECT_ICONS[node.cat.slug] || "📘" : null);
  return (
    <Link
      href={chainToHref(node.chain)}
      className={`inline-flex max-w-[15rem] items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.04] hover:shadow-lift ${
        LEVEL_STYLE[Math.min(level, LEVEL_STYLE.length - 1)]
      } ${level === 0 ? "text-base" : ""}`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      <span className="leading-tight">{node.cat.title}</span>
      {node.cat.questionnaireCode && (
        <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-bold opacity-80">
          {node.cat.questionnaireCode}
        </span>
      )}
    </Link>
  );
}

/** ענף רקורסיבי: צומת מימין, ילדים משמאל עם קווי חיבור */
function Branch({ node, level }: { node: Node; level: number }) {
  const has = node.children.length > 0;
  return (
    <div className="flex items-center">
      <NodeBox node={node} level={level} />
      {has && (
        <>
          {/* קו יוצא מהצומת */}
          <span aria-hidden className="h-0.5 w-6 shrink-0 bg-blue/30" />
          <ul className="flex flex-col gap-3">
            {node.children.map((child) => (
              <li
                key={child.cat.id}
                className="relative flex items-center ps-6 before:absolute before:right-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-blue/30 first:before:top-1/2 last:before:bottom-1/2 after:absolute after:right-0 after:top-1/2 after:h-0.5 after:w-6 after:-translate-y-1/2 after:bg-blue/30"
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

export default async function MapPage() {
  const tree = await buildTree(2);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-display text-4xl font-black">
            <GitBranch className="inline h-8 w-8 text-pink me-2" aria-hidden />
            מפת הבגרות המלאה
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            תרשים זרימה של כל המקצועות: מקצוע ← יחידות ← פנימי/חיצוני. לחצי על כל צומת כדי
            לפתוח את התיקייה שלו.
          </p>
        </div>
        <Link href="/subjects" className="btn btn-ghost text-sm">
          <FolderTree className="h-4 w-4" aria-hidden /> לצפייה לפי תיקיות
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted" aria-label="מקרא">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-full bg-gradient-to-br from-blue to-blue-deep" /> מקצוע
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-full border border-pink/60 bg-white" /> יחידות
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-full border border-gold/70 bg-white" /> פנימי / חיצוני
        </span>
      </div>

      {tree.length === 0 ? (
        <div className="card mt-10 p-12 text-center">
          <div className="text-6xl animate-float">🗺️</div>
          <h2 className="mt-4 text-2xl font-bold">המפה עדיין ריקה</h2>
          <p className="mt-2 text-muted">ברגע שיתווספו מקצועות – הם יופיעו כאן כתרשים זרימה.</p>
        </div>
      ) : (
        <AnimatedGrid className="mt-8 flex flex-col gap-6">
          {tree.map((root) => (
            <section
              key={root.cat.id}
              className="card overflow-x-auto p-5"
              aria-label={root.cat.title}
            >
              <div className="min-w-max">
                <Branch node={root} level={0} />
              </div>
            </section>
          ))}
        </AnimatedGrid>
      )}
    </div>
  );
}
