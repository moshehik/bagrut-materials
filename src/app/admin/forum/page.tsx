import Link from "next/link";
import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { forumThreads, forumPosts, forumReports, users, categories } from "@/db/schema";
import { ForumReportActions } from "@/components/admin/forum-report-actions";
import { FORUM_LABEL, forumAuthor, isForumKind } from "@/lib/forum-utils";
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

  // דיווחים פתוחים על תוכן לא הולם
  const reports = await db
    .select({
      id: forumReports.id,
      createdAt: forumReports.createdAt,
      threadId: forumReports.threadId,
      postId: forumReports.postId,
      reporterCode: users.personalCode,
    })
    .from(forumReports)
    .innerJoin(users, eq(forumReports.reporterId, users.id))
    .where(eq(forumReports.status, "open"))
    .orderBy(desc(forumReports.createdAt));

  const reportedThreads = reports.length
    ? await db
        .select({ id: forumThreads.id, kind: forumThreads.kind, body: forumThreads.body, code: users.personalCode })
        .from(forumThreads)
        .innerJoin(users, eq(forumThreads.userId, users.id))
        .where(inArray(forumThreads.id, reports.map((r) => r.threadId ?? -1)))
    : [];
  const reportedPosts = reports.length
    ? await db
        .select({ id: forumPosts.id, threadId: forumPosts.threadId, body: forumPosts.body, code: users.personalCode })
        .from(forumPosts)
        .innerJoin(users, eq(forumPosts.userId, users.id))
        .where(inArray(forumPosts.id, reports.map((r) => r.postId ?? -1)))
    : [];

  return (
    <div className="space-y-6">
      {reports.length > 0 && (
        <section className="card p-4 border-2 border-red-200 bg-red-50/40" aria-labelledby="fr-h">
          <h2 id="fr-h" className="font-display text-xl font-bold text-red-800">
            דיווחים על תוכן לא הולם ({reports.length})
          </h2>
          <ul className="divide-y divide-red-100 mt-2">
            {reports.map((r) => {
              const t = r.threadId ? reportedThreads.find((x) => x.id === r.threadId) : null;
              const po = r.postId ? reportedPosts.find((x) => x.id === r.postId) : null;
              const body = t?.body ?? po?.body ?? null;
              const code = t?.code ?? po?.code ?? "";
              const kindLabel = t ? (isForumKind(t.kind) ? FORUM_LABEL[t.kind] : "הודעה") : FORUM_LABEL.answer;
              const linkId = t?.id ?? po?.threadId;
              return (
                <li key={r.id} className="py-3 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">
                      {kindLabel} · כתבה: {code ? forumAuthor(code) : "—"} · דווח על ידי {forumAuthor(r.reporterCode)} ·{" "}
                      {r.createdAt.toLocaleDateString("he-IL")}
                    </p>
                    {body ? (
                      <p className="text-sm mt-1 whitespace-pre-wrap">{body}</p>
                    ) : (
                      <p className="text-sm mt-1 text-muted">התוכן כבר נמחק.</p>
                    )}
                    {linkId && (
                      <Link href={`/forum/${linkId}`} target="_blank" className="text-xs text-blue-deep hover:underline">
                        פתיחה ביחידה
                      </Link>
                    )}
                  </div>
                  <ForumReportActions reportId={r.id} threadId={t ? t.id : null} postId={po ? po.id : null} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
