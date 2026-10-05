import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { forumThreads, forumPosts, users, categories } from "@/db/schema";
import { ForumReportsSection } from "@/components/admin/forum-reports-section";
import { DeleteThreadButton } from "@/components/admin/delete-thread-button";

export const dynamic = "force-dynamic";

export default async function AdminForumPage() {
  const rows = await db
    .select({
      id: forumThreads.id,
      title: forumThreads.title,
      body: forumThreads.body,
      createdAt: forumThreads.createdAt,
      userName: users.name,
      userEmail: users.email,
      categoryTitle: categories.title,
      posts: count(forumPosts.id),
    })
    .from(forumThreads)
    .innerJoin(users, eq(forumThreads.userId, users.id))
    .leftJoin(categories, eq(forumThreads.categoryId, categories.id))
    .leftJoin(forumPosts, eq(forumPosts.threadId, forumThreads.id))
    .groupBy(forumThreads.id, users.name, users.email, categories.title)
    .orderBy(desc(forumThreads.createdAt));

  return (
    <div className="space-y-6">
      <ForumReportsSection />

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">פורום מורות</h2>
        <span className="chip bg-blue-soft text-blue-deep">{rows.length} דיונים</span>
        <span className="text-xs text-muted ms-auto">כל דיון שייך ליחידת לימוד ומוצג בדף שלה</span>
      </div>
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">אין עדיין דיונים.</div>
      ) : (
        <ul className="card divide-y divide-foreground/5">
          {rows.map((t) => (
            <li key={t.id} className="p-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/forum/${t.id}`}
                  target="_blank"
                  className="font-bold hover:text-blue-deep"
                >
                  {t.title}
                </Link>
                <p className="text-sm text-muted line-clamp-2 mt-1">{t.body}</p>
                <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3">
                  <span>{t.userName}</span>
                  <span dir="ltr">{t.userEmail}</span>
                  {t.categoryTitle && <span>· {t.categoryTitle}</span>}
                  <span>· {t.posts} תגובות</span>
                  <span>· {t.createdAt.toLocaleDateString("he-IL")}</span>
                </div>
              </div>
              <DeleteThreadButton id={t.id} title={t.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
