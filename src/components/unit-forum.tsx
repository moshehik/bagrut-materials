import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import {
  MessagesSquare,
  MessageCircle,
  Clock,
  UserRound,
  Lock,
  Sparkles,
  LogIn,
} from "lucide-react";
import { db } from "@/db";
import { forumPosts, forumThreads, users, type Category, type User } from "@/db/schema";
import { userHasPremium } from "@/lib/data";
import { NewThreadForm } from "@/components/forum-forms";

const fmt = (d: Date) =>
  d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
  " " +
  d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

/**
 * פורום מורות מוטמע ביחידת לימוד – שאלות ותשובות על השיעור הספציפי הזה.
 * אין פורום כללי נפרד; כל דיון שייך ליחידה שבה נשאל.
 */
export async function UnitForum({
  category,
  here,
  user,
}: {
  category: Category;
  here: string;
  user: User | null;
}) {
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
      replies: sql<number>`coalesce(${replies.n}, 0)`,
    })
    .from(forumThreads)
    .innerJoin(users, eq(forumThreads.userId, users.id))
    .leftJoin(replies, eq(replies.threadId, forumThreads.id))
    .where(eq(forumThreads.categoryId, category.id))
    .orderBy(desc(forumThreads.createdAt))
    .limit(50);

  return (
    <section className="mt-12" aria-labelledby="unit-forum-h">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-pink-soft text-pink" aria-hidden>
          <MessagesSquare className="h-5 w-5" />
        </span>
        <div>
          <h2 id="unit-forum-h" className="font-display text-2xl font-bold">
            פורום מורות – {category.title}
          </h2>
          <p className="text-sm text-muted">
            שאלות, עצות ורעיונות על השיעור הזה בדיוק – והתשובות נשארות כאן לכל המורות.
          </p>
        </div>
        {threads.length > 0 && (
          <span className="chip bg-blue-soft text-blue-deep ms-auto">
            {threads.length} דיונים
          </span>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {!user ? (
          <div className="card p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <span className="grid place-items-center h-12 w-12 rounded-2xl bg-blue-soft text-blue-deep shrink-0">
              <LogIn className="h-6 w-6" />
            </span>
            <p className="flex-1 text-sm text-muted leading-relaxed">
              <b className="text-foreground">רוצה לשאול על השיעור הזה?</b> הפורום פתוח למנויות
              פרימיום מחוברות – כל שאלה ותשובה נשמרות כאן, צמוד ליחידה.
            </p>
            <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-primary shrink-0">
              התחברי
            </Link>
          </div>
        ) : premium ? (
          <NewThreadForm categoryId={category.id} unitTitle={category.title} />
        ) : (
          <div className="card p-5 sm:p-6 relative overflow-hidden bg-gradient-to-br from-gold-soft/70 via-white to-pink-soft/60">
            <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-gold/15 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <span className="grid place-items-center h-12 w-12 rounded-2xl bg-white text-[#8a6500] shadow-md shrink-0">
                <Lock className="h-6 w-6" />
              </span>
              <p className="flex-1 text-sm text-muted leading-relaxed">
                <b className="text-foreground">הפורום פתוח למנויות פרימיום.</b> הצטרפי כדי לשאול על
                השיעור הזה, לקרוא את התשובות ולהתייעץ עם מורות שכבר לימדו אותו.
              </p>
              <Link href="/checkout?premium=1" className="btn btn-gold shrink-0">
                <Sparkles className="h-4 w-4" /> הצטרפי לפרימיום
              </Link>
            </div>
          </div>
        )}

        {threads.length === 0 ? (
          <div className="card p-8 text-center text-muted">
            <MessageCircle className="h-8 w-8 mx-auto text-blue mb-2" />
            <p className="font-semibold text-foreground">עדיין אין שאלות על היחידה הזו.</p>
            {user && premium && <p className="text-sm mt-1">היי הראשונה לפתוח שיחה!</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map((t, i) => {
              const inner = (
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center h-10 w-10 rounded-xl bg-blue-soft text-blue-deep shrink-0">
                    <MessageCircle className="h-5 w-5" />
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
                    </div>
                  </div>
                  <span className="chip bg-pink-soft text-pink shrink-0" title="תגובות">
                    <MessageCircle className="h-3.5 w-3.5" /> {t.replies}
                  </span>
                </div>
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
            })}
          </div>
        )}
      </div>
    </section>
  );
}
