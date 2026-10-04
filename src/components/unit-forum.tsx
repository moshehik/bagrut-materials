import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { MessageCircle, Lock, Sparkles, LogIn } from "lucide-react";
import { db } from "@/db";
import { forumPosts, forumThreads, users, type Category, type User } from "@/db/schema";
import { userHasPremium } from "@/lib/data";
import { ForumComposer } from "@/components/forum-forms";
import { ForumFeed, type FeedEntry } from "@/components/forum-feed";
import { forumWhen, isForumKind } from "@/lib/forum-utils";

/**
 * פורום מוטמע ביחידת לימוד – שאלות, הערות וטיפים על היחידה הספציפית הזו בלבד, ותשובות לשאלות.
 * אין פורום כללי נפרד; כל הודעה שייכת ליחידה שבה נכתבה. המורות מופיעות לפי מספר אישי, לא לפי שם.
 * העיצוב: כמו ההודעה "שימי לב!" שלפני תיקון קובץ – חלונית כחולה כהה עם ברק זהב; כל הודעה בריבוע
 * בצבע לפי הסוג (שאלה זהב בהיר / הערה סלמון / טיפ תכלת / תשובה במסגרת זהב מנצנצת) ומעליו תווית.
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
  const isAdmin = user?.role === "admin";

  const threads = await db
    .select({
      id: forumThreads.id,
      kind: forumThreads.kind,
      body: forumThreads.body,
      createdAt: forumThreads.createdAt,
      userId: forumThreads.userId,
      author: users.personalCode,
    })
    .from(forumThreads)
    .innerJoin(users, eq(forumThreads.userId, users.id))
    .where(eq(forumThreads.categoryId, category.id))
    .orderBy(desc(forumThreads.createdAt))
    .limit(50);

  const posts = threads.length
    ? await db
        .select({
          id: forumPosts.id,
          threadId: forumPosts.threadId,
          body: forumPosts.body,
          createdAt: forumPosts.createdAt,
          userId: forumPosts.userId,
          author: users.personalCode,
        })
        .from(forumPosts)
        .innerJoin(users, eq(forumPosts.userId, users.id))
        .where(
          inArray(
            forumPosts.threadId,
            threads.map((t) => t.id),
          ),
        )
        .orderBy(asc(forumPosts.createdAt))
    : [];

  const entries: FeedEntry[] = threads.map((t) => ({
    id: t.id,
    kind: isForumKind(t.kind) ? t.kind : "question",
    body: t.body,
    when: forumWhen(t.createdAt),
    userId: t.userId,
    author: t.author,
    answers: posts
      .filter((p) => p.threadId === t.id)
      .map((p) => ({ id: p.id, body: p.body, when: forumWhen(p.createdAt), userId: p.userId, author: p.author })),
  }));

  return (
    <section id="unit-forum" className="mt-12 scroll-mt-24" aria-labelledby="unit-forum-h">
      <div className="gate-panel forum-panel space-y-4 sm:!p-7">
        <span className="gold-ring" aria-hidden="true" />

        {/* הלוגו, ואחריו הכותרת */}
        <div className="flex flex-col items-center text-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-white.png" alt="לו״ז העניין" width={1491} height={871} className="fix-gate-logo" />
          <h2 id="unit-forum-h" className="text-3xl sm:text-4xl leading-tight">
            פורום על {category.title}
          </h2>
        </div>

        <div className="gate-card" role="note">
          <p className="text-xl">
            <b className="font-normal text-2xl">שימי לב</b> לענות בשפה נאותה ומכבדת ואך ורק על יחידת החומר הזו.
          </p>
        </div>

        {!user ? (
          <div className="gate-card flex flex-col sm:flex-row sm:items-center gap-3">
            <LogIn className="h-7 w-7 shrink-0" aria-hidden />
            <p className="flex-1">
              <b className="font-normal text-xl">רוצה לשאול או לשתף על השיעור הזה?</b>
              <span className="gate-soft block text-base leading-snug">
                הפורום פתוח למנויות פרימיום מחוברות – כל שאלה, הערה וטיפ נשמרים כאן, צמוד ליחידה.
              </span>
            </p>
            <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-gold shrink-0">
              התחברי
            </Link>
          </div>
        ) : premium ? (
          /* הלחצנים שלפני הצ'אט */
          <ForumComposer categoryId={category.id} />
        ) : (
          <div className="gate-card flex flex-col sm:flex-row sm:items-center gap-3">
            <Lock className="h-7 w-7 shrink-0" aria-hidden />
            <p className="flex-1">
              <b className="font-normal text-xl">הפורום פתוח למנויות פרימיום.</b>
              <span className="gate-soft block text-base leading-snug">
                הצטרפי כדי לשאול, להשיב ולשתף טיפים עם מורות שכבר לימדו את היחידה.
              </span>
            </p>
            <Link href="/checkout?premium=1" className="btn btn-gold shrink-0">
              <Sparkles className="h-4 w-4" /> הצטרפי לפרימיום
            </Link>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="gate-card text-center py-6">
            <MessageCircle className="h-9 w-9 mx-auto mb-1" aria-hidden />
            <p className="text-xl">עדיין אין כאן הודעות על היחידה הזו</p>
            <p className="gate-soft text-base">
              {user && premium
                ? "יש לך שאלה, הערה או טיפ? היי הראשונה לכתוב."
                : "ברגע שמורה תכתוב על היחידה, זה יופיע כאן."}
            </p>
          </div>
        ) : (
          <ForumFeed
            entries={entries}
            meId={user?.id ?? null}
            canParticipate={premium || isAdmin}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </section>
  );
}
