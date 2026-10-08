import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree, ChevronDown, ArrowUpLeft, Scissors, Check, BookOpenCheck } from "lucide-react";
import { getAllActiveCategories } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import type { Category } from "@/db/schema";
import { AnimatedGrid } from "@/components/animated-grid";
import { BagrutMapTree, type MapNode } from "@/components/bagrut-map-tree";
import { MapDraw } from "@/components/map-draw";
import { NutScrollHandleHorizontal } from "@/components/nut-scroll-handle";

export const metadata: Metadata = { title: "מפת הבגרות המלאה" };
export const dynamic = "force-dynamic";

async function buildTree(isAdmin: boolean): Promise<MapNode[]> {
  try {
    // שאילתה אחת לכל הקטגוריות; הרכבת העץ בזיכרון (רקורסיה לפי parentId)
    const all = await getAllActiveCategories(isAdmin);
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
  const user = await getCurrentUser().catch(() => null);
  const isAdmin = user?.role === "admin";
  const tree = await buildTree(isAdmin);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div className="flex items-center gap-5 sm:gap-8">
          <MapDraw className="w-24 sm:w-40 shrink-0 pointer-events-none select-none" />
          <div>
            <h1 className="text-4xl font-normal" style={{ fontFamily: "var(--font-hand)" }}>
              מפת הבגרות המלאה
            </h1>
            <p className="mt-2 max-w-2xl text-xl text-gold" style={{ fontFamily: "var(--font-hand)" }}>
              כאן תקבלי פריסה מלאה לכל חומרי הבגרות. לחצי על החלונות הנפתחים עד שתגיעי למידע שאת מחפשת.
            </p>
          </div>
        </div>
        <Link href="/subjects" className="btn btn-ghost text-sm">
          <FolderTree className="h-4 w-4" aria-hidden /> לצפייה לפי תיקיות
        </Link>
      </div>

      <section className="gate-panel map-guide animate-fade-up" aria-labelledby="map-guide-h">
        <span className="gold-ring" aria-hidden="true" />
        <h2 id="map-guide-h" className="map-guide-title">
          איך קוראים את התרשים
        </h2>
        <div className="map-guide-grid">
          <div className="gate-card map-guide-tile">
            <span className="gate-icon">
              <BookOpenCheck className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="map-guide-brown">
              <b>הסבר</b>
              הכפתור ״הסבר״ על כל בגרות מראה בקצרה ובסדר איך הציון בנוי
            </span>
          </div>
          <div className="gate-card map-guide-tile">
            <span className="gate-icon map-guide-code-icon">
              <span className="q-code-tag px-1.5 text-[0.65rem]" aria-hidden>3381</span>
            </span>
            <span>
              <b>סמל שאלון</b>
              הסמל מופיע בחלון שבו יש סמל שאלון אחד. לחצי על הריבועים עד שתגיעי לסמל המבוקש
            </span>
          </div>
          <div className="gate-card map-guide-tile">
            <span className="gate-icon">
              <ChevronDown className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span>
              <b>פתיחת ריבוע</b>
              לחיצה על ריבוע החלון עצמו פותחת את הריבוע הבא. לחיצה על החלון הקודם סוגרת את החלון האחרון
            </span>
          </div>
          <div className="gate-card map-guide-tile">
            <span className="gate-icon">
              <ArrowUpLeft className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span>
              <b>החץ הקטן</b>
              לחיצה על החץ מביאה אל התיקייה עצמה
            </span>
          </div>
          <div className="gate-card map-guide-tile">
            <span className="gate-icon">
              <Scissors className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span>
              <b>קו חוצה</b>
              נושא שלא נדרש בתשפ״ז לפי מיקוד משרד החינוך. בפרק שרק חלקו הוצא — ריבוע צמוד מתחתיו מפרט מה לא נדרש
            </span>
          </div>
          <div className="gate-card map-guide-tile">
            <span className="gate-icon">
              <Check className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span>
              <b>הוכן חומר</b>
              נושא המסומן ב-<Check className="inline h-3.5 w-3.5 align-text-bottom" strokeWidth={2} aria-label="וי" /> — כבר הוכן לו חומר בפועל
            </span>
          </div>
        </div>
      </section>

      {tree.length === 0 ? (
        <div className="card mt-10 p-12 text-center">
          <div className="text-6xl animate-float">🗺️</div>
          <h2 className="mt-4 text-2xl font-bold">המפה עדיין ריקה</h2>
          <p className="mt-2 text-muted">ברגע שיתווספו מקצועות – הם יופיעו כאן.</p>
        </div>
      ) : (
        <>
          <NutScrollHandleHorizontal />
          <AnimatedGrid className="mt-8">
            <BagrutMapTree tree={tree} />
          </AnimatedGrid>
        </>
      )}
    </div>
  );
}
