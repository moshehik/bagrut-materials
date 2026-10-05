import { requireAdminPage } from "@/lib/session";
import Link from "next/link";
import { asc, count, desc, eq, isNull } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { categories, materials } from "@/db/schema";
import { getCategoryChain, getChildren, getMaterials, chainToHref } from "@/lib/data";
import { UploadForm } from "@/components/admin/upload-form";
import { MaterialRow } from "@/components/admin/material-row";

export const dynamic = "force-dynamic";

export default async function AdminMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const categoryId = sp.category ? Number(sp.category) : NaN;

  if (!Number.isInteger(categoryId)) {
    return <PickCategory />;
  }

  const [chain, children, mats] = await Promise.all([
    getCategoryChain(categoryId),
    getChildren(categoryId),
    getMaterials(categoryId),
  ]);
  const current = chain[chain.length - 1];
  if (!current || current.id !== categoryId) {
    return (
      <div className="card p-8 text-center">
        <p className="text-muted">הקטגוריה לא נמצאה.</p>
        <Link href="/admin/categories" className="btn btn-oak mt-4">
          לעץ הקטגוריות
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav aria-label="מיקום" className="text-sm">
        <ol className="flex flex-wrap items-center gap-1 text-muted">
          <li>
            <Link href="/admin/categories" className="hover:text-blue-deep">
              עץ הקטגוריות
            </Link>
          </li>
          {chain.map((c, i) => (
            <li key={c.id} className="flex items-center gap-1">
              <ChevronLeft className="h-3.5 w-3.5 opacity-60" aria-hidden />
              {i === chain.length - 1 ? (
                <span className="font-semibold text-foreground">{c.title}</span>
              ) : (
                <Link
                  href={`/admin/materials?category=${c.id}`}
                  className="hover:text-blue-deep"
                >
                  {c.title}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">
          {current.icon} {current.title}
        </h2>
        <span className="chip bg-blue-soft text-blue-deep">{mats.length} חומרים</span>
        <Link
          href={chainToHref(chain)}
          target="_blank"
          className="btn btn-ghost text-xs py-1 ms-auto"
        >
          צפייה באתר ↗
        </Link>
      </div>

      {children.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <Link
              key={c.id}
              href={`/admin/materials?category=${c.id}`}
              className="chip bg-oak-soft text-oak-deep hover:bg-oak/30"
            >
              📁 {c.title}
            </Link>
          ))}
        </div>
      )}

      <section className="card p-5">
        <h3 className="font-bold text-lg mb-3">העלאת חומר חדש</h3>
        <UploadForm categoryId={categoryId} />
      </section>

      <section className="card p-5">
        <h3 className="font-bold text-lg mb-3">חומרים בקטגוריה</h3>
        {mats.length === 0 ? (
          <p className="text-muted text-sm">אין עדיין חומרים בקטגוריה זו.</p>
        ) : (
          <ul className="divide-y divide-foreground/5">
            {mats.map((m) => (
              <MaterialRow key={m.id} material={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function PickCategory() {
  const [roots, recent] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(isNull(categories.parentId))
      .orderBy(asc(categories.sort), asc(categories.id)),
    db
      .select({
        id: materials.id,
        title: materials.title,
        categoryId: materials.categoryId,
        categoryTitle: categories.title,
        createdAt: materials.createdAt,
        downloads: materials.downloads,
      })
      .from(materials)
      .innerJoin(categories, eq(materials.categoryId, categories.id))
      .orderBy(desc(materials.createdAt))
      .limit(20),
  ]);
  const [{ n }] = await db.select({ n: count() }).from(materials);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">חומרים</h2>
        <span className="chip bg-blue-soft text-blue-deep">{n} סה״כ</span>
      </div>
      <div className="card p-5">
        <p className="text-sm text-muted mb-3">
          בחרי מקצוע כדי לנווט לקטגוריה, או עברי דרך{" "}
          <Link href="/admin/categories" className="text-blue-deep underline">
            עץ הקטגוריות
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          {roots.map((c) => (
            <Link
              key={c.id}
              href={`/admin/materials?category=${c.id}`}
              className="chip bg-oak-soft text-oak-deep hover:bg-oak/30 text-sm"
            >
              {c.icon} {c.title}
            </Link>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <h3 className="font-bold text-lg mb-3">חומרים אחרונים</h3>
        {recent.length === 0 ? (
          <p className="text-muted text-sm">אין עדיין חומרים.</p>
        ) : (
          <ul className="divide-y divide-foreground/5 text-sm">
            {recent.map((m) => (
              <li key={m.id} className="py-2 flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/materials?category=${m.categoryId}`}
                  className="font-medium hover:text-blue-deep"
                >
                  {m.title}
                </Link>
                <span className="text-muted">· {m.categoryTitle}</span>
                <span className="ms-auto text-xs text-muted">
                  {m.downloads} הורדות · {m.createdAt.toLocaleDateString("he-IL")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
