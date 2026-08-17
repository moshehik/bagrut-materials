import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { MessagesSquare, Lock, Sparkles, MessageCircle, Clock, UserRound } from "lucide-react";
import { db } from "@/db";
import { categories, forumPosts, forumThreads, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { userHasPremium, getRootSubjects } from "@/lib/data";
import { SUBJECT_ICONS } from "@/lib/constants";
import { NewThreadForm } from "@/components/forum-forms";

export const metadata: Metadata = { title: "פורום מורות" };
export const dynamic = "force-dynamic";

const fmt = (d: Date) =>
  d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
  " " +
  d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

export default async function ForumPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/forum");
  const premium = await userHasPremium(user);

  const replies = db
    .select({ threadId: forumPosts.threadId, n: sql<number>`count(*)::int`.as("n") })
    .from(forumPosts)
    .groupBy(forumPosts.threadId)
    .as("replies");

  const threads = await db
    .select({
      id: forumThreads.id,
      title: forumThreads.title,
      body: forumThreads.body,
      createdAt: forumThreads.createdAt,
      author: users.name,
      category: categories.title,
      categorySlug: categories.slug,
      categoryIcon: categories.icon,
      replies: sql<number>`coalesce(${replies.n}, 0)`,
    })
    .from(forumThreads)
    .innerJoin(users, eq(forumThreads.userId, users.id))
    .leftJoin(categories, eq(forumThreads.categoryId, categories.id))
    .leftJoin(replies, eq(replies.threadId, forumThreads.id))
    .orderBy(desc(forumThreads.createdAt))
    .limit(premium ? 100 : 6);

  const subjects = premium
    ? (await getRootSubjects()).map((r) => ({
        id: r.id,
        title: r.title,
        icon: r.icon ?? SUBJECT_ICONS[r.slug] ?? "📘",
      }))
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <header className="animate-fade-up">
        <p className="text-sm text-muted flex items-center gap-1">
          <MessagesSquare className="h-4 w-4" /> קהילה
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold">פורום מורות</h1>
        <p className="text-muted mt-2 max-w-2xl leading-relaxed">
          מקום <b className="text-foreground">לשאול, להתייעץ ולייעץ</b> – איך מלמדים פרק קשה, מה עבד
          בכיתה, אילו שאלות חוזרות בבגרות ואיך מנהלים את הזמן. הפורום פתוח למנויות פרימיום, כדי
          לשמור על שיח מקצועי ואיכותי.
        </p>
      </header>

      {premium ? (
        <div className="animate-fade-up [animation-delay:80ms]">
          <NewThreadForm subjects={subjects} />
        </div>
      ) : (
        <div className="card p-6 sm:p-8 relative overflow-hidden animate-fade-up [animation-delay:80ms] bg-gradient-to-br from-gold-soft/70 via-white to-pink-soft/60">
          <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-gold/15 blur-2xl" />
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center relative">
            <span className="grid place-items-center h-14 w-14 rounded-2xl bg-white text-[#8a6500] shadow-md shrink-0">
              <Lock className="h-7 w-7" />
            </span>
            <div className="flex-1">
              <h2 className="font-bold text-xl">הפורום נעול למנויות פרימיום</h2>
              <p className="text-sm text-muted mt-1 leading-relaxed">
                אפשר להציץ בכותרות למטה. כדי לקרוא, לשאול ולהגיב – הוסיפי פרימיום למנוי שלך. הפרימיום
                פותח גם שאלות מבגרויות קודמות, מצגות, טיפים למסירה ורעיונות לשיעור.
              </p>
            </div>
            <Link href="/checkout?premium=1" className="btn btn-gold shrink-0">
              <Sparkles className="h-4 w-4" /> הצטרפי לפרימיום
            </Link>
          </div>
        </div>
      )}

      <section className="space-y-3">
        {threads.length === 0 ? (
          <div className="card p-10 text-center text-muted animate-fade-up">
            <MessageCircle className="h-10 w-10 mx-auto text-blue mb-3" />
            <p className="font-semibold text-foreground">עדיין אין דיונים בפורום.</p>
            <p className="text-sm mt-1">
              {premium ? "היי הראשונה לפתוח שיחה!" : "בקרוב יופיעו כאן שאלות ותשובות של מורות."}
            </p>
          </div>
        ) : (
          threads.map((t, i) => {
            const inner = (
              <>
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center h-10 w-10 rounded-xl bg-blue-soft text-blue-deep shrink-0 text-lg">
                    {t.categoryIcon ?? (t.categorySlug ? (SUBJECT_ICONS[t.categorySlug] ?? "💬") : "💬")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold leading-snug group-hover:text-blue-deep">{t.title}</h3>
                    {premium ? (
                      <p className="text-sm text-muted line-clamp-2 mt-0.5">{t.body}</p>
                    ) : (
                      <p className="text-sm text-muted mt-0.5 select-none blur-[3px]" aria-hidden>
                        {t.body.slice(0, 120)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mt-2">
                      <span className="flex items-center gap-1">
                        <UserRound className="h-3.5 w-3.5" /> {t.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {fmt(t.createdAt)}
                      </span>
                      {t.category && <span className="chip bg-blue-soft text-blue-deep">{t.category}</span>}
                    </div>
                  </div>
                  <span className="chip bg-pink-soft text-pink shrink-0" title="תגובות">
                    <MessageCircle className="h-3.5 w-3.5" /> {t.replies}
                  </span>
                </div>
              </>
            );
            const cls = `card p-4 sm:p-5 block group animate-fade-up ${premium ? "card-hover" : "opacity-90"}`;
            return premium ? (
              <Link key={t.id} href={`/forum/${t.id}`} className={cls} style={{ animationDelay: `${i * 40}ms` }}>
                {inner}
              </Link>
            ) : (
              <div key={t.id} className={cls} style={{ animationDelay: `${i * 40}ms` }}>
                {inner}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
