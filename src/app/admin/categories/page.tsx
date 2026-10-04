import { asc, count } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials } from "@/db/schema";
import { CategoryTree, type TreeNode } from "@/components/admin/category-tree";
import { CategoryForm } from "@/components/admin/category-form";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const [all, counts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sort), asc(categories.id)),
    db
      .select({ categoryId: materials.categoryId, n: count() })
      .from(materials)
      .groupBy(materials.categoryId),
  ]);
  const countMap = new Map(counts.map((c) => [c.categoryId, c.n]));

  const byParent = new Map<number | null, TreeNode[]>();
  for (const c of all) {
    const node: TreeNode = {
      id: c.id,
      parentId: c.parentId,
      slug: c.slug,
      title: c.title,
      description: c.description,
      questionnaireCode: c.questionnaireCode,
      icon: c.icon,
      color: c.color,
      sort: c.sort,
      bundlePrice: c.bundlePrice,
      status: c.status,
      materialsCount: countMap.get(c.id) ?? 0,
      children: [],
    };
    const list = byParent.get(c.parentId) ?? [];
    list.push(node);
    byParent.set(c.parentId, list);
  }
  const attach = (n: TreeNode): TreeNode => ({
    ...n,
    children: (byParent.get(n.id) ?? []).map(attach),
  });
  const roots = (byParent.get(null) ?? []).map(attach);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">עץ הקטגוריות</h2>
        <span className="chip bg-oak-soft text-oak-deep">{all.length} קטגוריות</span>
      </div>

      <details className="card p-5">
        <summary className="cursor-pointer font-bold">➕ הוספת מקצוע חדש (שורש)</summary>
        <div className="mt-4">
          <CategoryForm mode="create" parentId={null} />
        </div>
      </details>

      <CategoryTree roots={roots} />
    </div>
  );
}
