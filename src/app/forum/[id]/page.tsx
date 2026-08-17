import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowRight, Clock, UserRound, MessageCircle, Sparkles, Lock } from "lucide-react";
import { db } from "@/db";
import { categories, forumPosts, forumThreads, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { userHasPremium } from "@/lib/data";
import { ReplyForm } from "@/components/forum-forms";

export const dynamic = "force-dynamic";

const fmt = (d: Date) =>
  d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
  " " +
  d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

async function loadThread(id: number) {
  const [t] = await db
    .select({
      id: forumThreads.id,
      title: forumThreads.title,
      body: forumThreads.body,
      createdAt: forumThreads.createdAt,
      userId: forumThreads.userId,
      author: users.name,
      category: categories.title,
    })
    .from(forumThreads)
    .innerJoin(users, eq(forumThreads.userId, users.id))
    .leftJoin(categories, eq(forumThreads.categoryId, categories.id))
    .where(eq(forumThreads.id, id))
    .limit(1);
  return t ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return { title: "פורום מורות" };
  const t = await loadThread(id);
  return { title: t ? `${t.title} | פורום מורות` : "פורום מורות" };
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/forum/${id}`);
  const premium = await userHasPremium(user);

  const thread = await loadThread(id);
  if (!thread) notFound();

  if (!premium) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-4 animate-fade-up">
        <span className="grid place-items-center h-16 w-16 rounded-2xl bg-gold-soft text-[#8a6500] mx-auto">
          <Lock className="h-8 w-8" />
        </span>
        <h1 className="font-display text-2xl font-bold">{thread.title}</h1>
        <p className="text-muted">הדיון המלא פתוח למנויות פרימיום. הצטרפי כדי לקרוא ולהשתתף.</p>
        <div className="flex gap-2 justify-center">
          <Link href="/checkout?premium=1" className="btn btn-gold">
            <Sparkles className="h-4 w-4" /> הצטרפי לפרימיום
          </Link>
          <Link href="/forum" className="btn btn-ghost">
            חזרה לפורום
          </Link>
        </div>
      </div>
    );
  }

  const posts = await db
    .select({
      id: forumPosts.id,
      body: forumPosts.body,
      createdAt: forumPosts.createdAt,
      userId: forumPosts.userId,
      author: users.name,
    })
    .from(forumPosts)
    .innerJoin(users, eq(forumPosts.userId, users.id))
    .where(eq(forumPosts.threadId, thread.id))
    .orderBy(asc(forumPosts.createdAt));

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <Link href="/forum" className="inline-flex items-center gap-1 text-sm text-blue-deep hover:underline">
        <ArrowRight className="h-4 w-4" /> חזרה לפורום
      </Link>

      <article className="card p-6 sm:p-8 animate-fade-up">
        {thread.category && <span className="chip bg-blue-soft text-blue-deep mb-3">{thread.category}</span>}
        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">{thread.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mt-2">
          <span className="flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" /> {thread.author}
            {thread.userId === user.id && <span className="chip bg-pink-soft text-pink">את</span>}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {fmt(thread.createdAt)}
          </span>
        </div>
        <p className="mt-5 whitespace-pre-wrap leading-relaxed">{thread.body}</p>
      </article>

      <section className="space-y-3">
        <h2 className="font-bold flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-pink" /> {posts.length} תגובות
        </h2>
        {posts.length === 0 ? (
          <p className="text-sm text-muted card p-5">עדיין אין תגובות – היי הראשונה לענות.</p>
        ) : (
          <ol className="space-y-3">
            {posts.map((p, i) => (
              <li
                key={p.id}
                className={`card p-4 sm:p-5 animate-fade-up ${p.userId === thread.userId ? "border-pink/30" : ""}`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-center gap-2 text-xs text-muted mb-2">
                  <span className="grid place-items-center h-7 w-7 rounded-full bg-blue-soft text-blue-deep font-bold">
                    {p.author.trim().charAt(0)}
                  </span>
                  <span className="font-semibold text-foreground">{p.author}</span>
                  {p.userId === thread.userId && <span className="chip bg-pink-soft text-pink">השואלת</span>}
                  <span className="ms-auto">{fmt(p.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{p.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card p-5 sm:p-6 animate-fade-up">
        <ReplyForm threadId={thread.id} />
      </section>
    </div>
  );
}
