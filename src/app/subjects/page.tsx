import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree, GitBranch } from "lucide-react";
import { getRootSubjects, countMaterialsUnder } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import type { Category } from "@/db/schema";
import { AnimatedGrid } from "@/components/animated-grid";
import { SubjectCard } from "@/components/subject-card";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = { title: "המקצועות" };
export const dynamic = "force-dynamic";

async function load(): Promise<{ subject: Category; count: number }[]> {
  try {
    const user = await getCurrentUser().catch(() => null);
    const isAdmin = user?.role === "admin";
    const subjects = await getRootSubjects(isAdmin);
    return Promise.all(
      subjects.map(async (subject) => ({
        subject,
        count: await countMaterialsUnder(subject.id, isAdmin).catch(() => 0),
      })),
    );
  } catch {
    return [];
  }
}

export default async function SubjectsPage() {
  const rows = await load();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <Breadcrumbs chain={[]} />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-display text-4xl font-black">
            <FolderTree className="inline h-8 w-8 text-blue me-2" aria-hidden />
            המקצועות
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            כל מקצוע הוא תיקייה. פתחי אותה, ורדי דרך היחידות, פנימי/חיצוני והנושאים – עד לפרק
            שאת מלמדת.
          </p>
        </div>
        <Link href="/map" className="btn btn-ghost text-sm">
          <GitBranch className="h-4 w-4" aria-hidden /> לצפייה כתרשים זרימה
        </Link>
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
              description={s.description}
              questionnaireCode={s.questionnaireCode}
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
