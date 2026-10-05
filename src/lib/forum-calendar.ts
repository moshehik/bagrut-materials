import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { categories, forumPosts, forumThreads, users } from "@/db/schema";
import { jerusalemIso } from "@/lib/hebrew-date";
import { FORUM_LABEL, forumTitleFrom, type ForumKind } from "@/lib/forum-utils";
import type { CalGroup } from "@/lib/download-groups";

const hhmm = (d: Date) =>
  d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

/**
 * פעילות בפורום (שאלות/הערות/טיפים שפרסמה ותגובות שהגיבה) כקבוצות ללוח השנה.
 * הפורום מוטמע בכל יחידת לימוד, ולכן "באיזה פורום" = היחידה: הקבוצה מקושרת ליחידה (#unit-forum),
 * וכל פריט מקושר להודעה המדויקת (/forum/:id מפנה אליה).
 * userId – רק של משתמשת אחת (לוח הלקוחה); בלי – של כולן (לוח המנהלת, עם שם).
 */
export async function loadForumGroups(opts: { from: Date; to: Date; userId?: number }): Promise<CalGroup[]> {
  const { from, to, userId } = opts;
  const [threads, posts, cats] = await Promise.all([
    db
      .select({
        id: forumThreads.id,
        createdAt: forumThreads.createdAt,
        kind: forumThreads.kind,
        body: forumThreads.body,
        categoryId: forumThreads.categoryId,
        userId: users.id,
        userName: users.name,
      })
      .from(forumThreads)
      .innerJoin(users, eq(forumThreads.userId, users.id))
      .where(
        and(
          gte(forumThreads.createdAt, from),
          lte(forumThreads.createdAt, to),
          userId ? eq(forumThreads.userId, userId) : undefined,
        ),
      )
      .orderBy(asc(forumThreads.createdAt)),
    db
      .select({
        id: forumPosts.id,
        createdAt: forumPosts.createdAt,
        body: forumPosts.body,
        threadId: forumThreads.id,
        threadTitle: forumThreads.title,
        categoryId: forumThreads.categoryId,
        userId: users.id,
        userName: users.name,
      })
      .from(forumPosts)
      .innerJoin(forumThreads, eq(forumPosts.threadId, forumThreads.id))
      .innerJoin(users, eq(forumPosts.userId, users.id))
      .where(
        and(
          gte(forumPosts.createdAt, from),
          lte(forumPosts.createdAt, to),
          userId ? eq(forumPosts.userId, userId) : undefined,
        ),
      )
      .orderBy(asc(forumPosts.createdAt)),
    db.select({ id: categories.id, title: categories.title, slug: categories.slug, parentId: categories.parentId }).from(categories),
  ]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const chainOf = (id: number | null) => {
    const out: { title: string; slug: string }[] = [];
    let cur = id;
    let guard = 0;
    while (cur !== null && guard++ < 20) {
      const c = byId.get(cur);
      if (!c) break;
      out.unshift({ title: c.title, slug: c.slug });
      cur = c.parentId;
    }
    return out;
  };

  type Acc = CalGroup & { _first: number };
  const map = new Map<string, Acc>();
  const add = (
    at: Date,
    categoryId: number | null,
    uid: number,
    uname: string,
    item: CalGroup["items"][number],
  ) => {
    const dateIso = jerusalemIso(at);
    const key = `${dateIso}|${categoryId ?? 0}|${userId ? 0 : uid}`;
    let g = map.get(key);
    if (!g) {
      const chain = chainOf(categoryId);
      g = {
        dateIso,
        categoryId: categoryId ?? 0,
        folder: chain[chain.length - 1]?.title ?? "פורום המורות",
        chain: chain.length ? chain.map((c) => c.title).join(" › ") : "פורום המורות",
        who: userId ? undefined : uname,
        whole: false,
        total: 0,
        forum: true,
        href: chain.length ? `/subjects/${chain.map((c) => encodeURIComponent(c.slug)).join("/")}#unit-forum` : "/subjects",
        items: [],
        _first: at.getTime(),
      };
      map.set(key, g);
    }
    g.items.push(item);
    g.total = g.items.length;
  };

  for (const t of threads) {
    add(t.createdAt, t.categoryId, t.userId, t.userName, {
      materialId: t.id,
      title: `${FORUM_LABEL[(t.kind as ForumKind) in FORUM_LABEL ? (t.kind as ForumKind) : "question"]}: ${forumTitleFrom(t.body)}`,
      type: "forum",
      time: hhmm(t.createdAt),
      href: `/forum/${t.id}`,
    });
  }
  for (const p of posts) {
    add(p.createdAt, p.categoryId, p.userId, p.userName, {
      materialId: p.id,
      title: `תגובה: ${forumTitleFrom(p.body)}`,
      sub: `בשרשור: ${p.threadTitle}`,
      type: "forum",
      time: hhmm(p.createdAt),
      href: `/forum/${p.threadId}`,
    });
  }

  return [...map.values()]
    .sort((a, b) => a._first - b._first)
    .map((g) => {
      const { _first, ...clean } = g;
      void _first;
      clean.items.sort((a, b) => a.time.localeCompare(b.time));
      return clean;
    });
}
