import { requireAdminPage } from "@/lib/session";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { forumThreads, forumPosts, forumReports, users } from "@/db/schema";
import { ForumReportActions } from "@/components/admin/forum-report-actions";
import { FORUM_LABEL, forumAuthor, isForumKind } from "@/lib/forum-utils";

/** דיווחים פתוחים על תוכן לא הולם בפורום – משותף ל-/admin/forum ול-/admin/inbox. כשאין דיווחים: `showEmpty` מציג הודעה, אחרת לא מוצג כלום */
export async function ForumReportsSection({ showEmpty = false }: { showEmpty?: boolean }) {
  await requireAdminPage();
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

  if (reports.length === 0) {
    return showEmpty ? (
      <section aria-labelledby="fr-h">
        <h2 id="fr-h" className="mb-2 font-display text-xl font-bold">
          דיווחים על תוכן לא הולם
        </h2>
        <div className="card p-6 text-center text-muted">אין דיווחים פתוחים.</div>
      </section>
    ) : null;
  }

  const reportedThreads = await db
    .select({ id: forumThreads.id, kind: forumThreads.kind, body: forumThreads.body, code: users.personalCode })
    .from(forumThreads)
    .innerJoin(users, eq(forumThreads.userId, users.id))
    .where(inArray(forumThreads.id, reports.map((r) => r.threadId ?? -1)));
  const reportedPosts = await db
    .select({ id: forumPosts.id, threadId: forumPosts.threadId, body: forumPosts.body, code: users.personalCode })
    .from(forumPosts)
    .innerJoin(users, eq(forumPosts.userId, users.id))
    .where(inArray(forumPosts.id, reports.map((r) => r.postId ?? -1)));

  return (
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
  );
}
