import type { Metadata } from "next";
import Link from "next/link";
import { MapDraw } from "@/components/map-draw";
import { getRootSubjects, countMaterialsUnder } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { getMyRootSubjectIds } from "@/lib/home-personal";
import type { Category } from "@/db/schema";
import { AnimatedGrid } from "@/components/animated-grid";
import { SubjectCard } from "@/components/subject-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
export const metadata: Metadata = { title: "המקצועות" };
export const dynamic = "force-dynamic";

async function load(
  wantMine: boolean,
): Promise<{ rows: { subject: Category; count: number }[]; mineView: boolean }> {
  try {
    const user = await getCurrentUser().catch(() => null);
    const isAdmin = user?.role === "admin";
    let subjects = await getRootSubjects(isAdmin);
    // "המקצועות שלך" (מדף הבית): רק מקצועות שברשותה / שהורידה מהם. אם אין אף אחד – מציגים הכל
    let mineView = false;
    if (wantMine && user) {
      const mineIds = await getMyRootSubjectIds(user).catch(() => new Set<number>());
      if (mineIds.size > 0) {
        subjects = subjects.filter((s) => mineIds.has(s.id));
        mineView = true;
      }
    }
    const rows = await Promise.all(
      subjects.map(async (subject) => ({
        subject,
        count: await countMaterialsUnder(subject.id, isAdmin).catch(() => 0),
      })),
    );
    return { rows, mineView };
  } catch {
    return { rows: [], mineView: false };
  }
}

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const { rows, mineView } = await load(!!(await searchParams).mine);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <Breadcrumbs chain={[]} />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-4xl font-normal" style={{ fontFamily: "var(--font-hand)" }}>
            {mineView ? "המקצועות שלך" : "המקצועות"}
          </h1>
          <p className="mt-2 max-w-2xl text-xl text-gold" style={{ fontFamily: "var(--font-hand)" }}>
            כל מקצוע הוא תיקייה. פתחי אותה, והגיעי עד לפרק המדויק לו את זקוקה.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mineView && (
            <Link
              href="/subjects"
              className="btn btn-ghost text-xl font-normal"
              style={{ fontFamily: "var(--font-hand)" }}
            >
              לכל המקצועות
            </Link>
          )}
          <Link
            href="/map"
            className="btn btn-ghost text-xl font-normal"
            style={{ fontFamily: "var(--font-hand)" }}
          >
            <MapDraw className="w-10 shrink-0 pointer-events-none select-none" /> לצפייה כתרשים זרימה
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-10 p-12 text-center">
          <div className="text-6xl animate-float">🗂️</div>
          <h2 className="mt-4 text-2xl font-bold">עדיין אין מקצועות במאגר</h2>
          <p className="mt-2 text-muted">התיקיות הראשונות בדרך. חזרי בקרוב!</p>
        </div>
      ) : (
        <AnimatedGrid className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map(({ subject: s, count }) => (
            <SubjectCard
              key={s.id}
              size="lg"
              href={`/subjects/${encodeURIComponent(s.slug)}`}
              title={s.title}
              slug={s.slug}
              count={count}
              color={s.color}
              nutKey={s.slug}
              nutDepth={0}
            />
          ))}
        </AnimatedGrid>
      )}
    </div>
  );
}
