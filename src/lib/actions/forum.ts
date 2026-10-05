"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, forumPosts, forumReports, forumThreads, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { userCanUseUnitForum, getCategoryChain, chainToHref } from "@/lib/data";
import { adminEmail, sendMailInBackground, templates } from "@/lib/mail";
import { FORUM_KINDS, forumAuthor, forumTitleFrom } from "@/lib/forum-utils";
import { logAudit } from "@/lib/audit";

export type ForumState = { error?: string; ok?: boolean; reported?: boolean } | undefined;

/** כניסה + גישה ליחידה: מנויה, או מי ששילמה על קובץ/תיקייה ביחידה (categoryId ריק = רק בדיקת התחברות) */
async function requirePremiumUser(op: string, categoryId?: number) {
  const user = await getCurrentUser();
  if (!user) {
    await logAudit({ action: "forum.denied", details: { reason: "not_logged_in", op } });
    return { error: "יש להתחבר כדי לכתוב בפורום" } as const;
  }
  if (user.suspended || (categoryId !== undefined && !(await userCanUseUnitForum(user, categoryId)))) {
    await logAudit({
      actorId: user.id,
      action: "forum.denied",
      details: { reason: user.suspended ? "suspended" : "no_unit_access", op },
    });
    return { error: "הפורום פתוח למנויות ולמי ששילמה על קובץ ביחידה הזו" } as const;
  }
  return { user } as const;
}

/** מרענן את דף היחידה שבה נמצאת ההודעה (הפורום מוטמע בו) */
async function revalidateUnit(categoryId: number | null) {
  if (!categoryId) return;
  const chain = await getCategoryChain(categoryId);
  if (chain.length > 0) revalidatePath(chainToHref(chain));
}

const threadSchema = z.object({
  // שאלה / הערה / טיפ – המורה חייבת לבחור אחד מהם
  kind: z.enum(FORUM_KINDS, { message: "בחרי קודם: שאלה, הערה או טיפ" }),
  body: z.string().trim().min(4, "כתבי לפחות כמה מילים").max(8000, "ההודעה ארוכה מדי"),
  // כל הודעה שייכת ליחידת לימוד – אין הודעות "כלליות"
  categoryId: z.coerce.number().int().positive(),
});

export async function createThread(_prev: ForumState, form: FormData): Promise<ForumState> {
  const catId = Number(form.get("categoryId"));
  const auth = await requirePremiumUser("thread.create", Number.isInteger(catId) && catId > 0 ? catId : undefined);
  if ("error" in auth) return { error: auth.error };

  const parsed = threadSchema.safeParse({
    kind: form.get("kind"),
    body: form.get("body"),
    categoryId: form.get("categoryId"),
  });
  if (!parsed.success) {
    await logAudit({
      actorId: auth.user.id,
      action: "forum.denied",
      details: { reason: "validation", op: "thread.create", message: parsed.error.issues[0].message },
    });
    return { error: parsed.error.issues[0].message };
  }

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, parsed.data.categoryId))
    .limit(1);
  if (!cat) {
    await logAudit({
      actorId: auth.user.id,
      action: "forum.denied",
      details: { reason: "category_not_found", op: "thread.create", categoryId: parsed.data.categoryId },
    });
    return { error: "יחידת הלימוד לא נמצאה" };
  }

  const [t] = await db
    .insert(forumThreads)
    .values({
      userId: auth.user.id,
      kind: parsed.data.kind,
      title: forumTitleFrom(parsed.data.body),
      body: parsed.data.body,
      categoryId: parsed.data.categoryId,
    })
    .returning({ id: forumThreads.id });

  await logAudit({
    actorId: auth.user.id,
    action: "forum.thread.create",
    entityType: "forum_thread",
    entityId: t.id,
    details: { categoryId: parsed.data.categoryId, kind: parsed.data.kind },
  });

  await revalidateUnit(parsed.data.categoryId);
  return { ok: true };
}

const replySchema = z.object({
  threadId: z.coerce.number().int().positive(),
  body: z.string().trim().min(2, "התשובה קצרה מדי").max(8000, "התשובה ארוכה מדי"),
});

/** תשובה לשאלה (רק שאלות מקבלות תשובות – לא הערות וטיפים) */
export async function replyThread(_prev: ForumState, form: FormData): Promise<ForumState> {
  const auth = await requirePremiumUser("post.create");
  if ("error" in auth) return { error: auth.error };

  const parsed = replySchema.safeParse({ threadId: form.get("threadId"), body: form.get("body") });
  if (!parsed.success) {
    await logAudit({
      actorId: auth.user.id,
      action: "forum.denied",
      details: { reason: "validation", op: "post.create", message: parsed.error.issues[0].message },
    });
    return { error: parsed.error.issues[0].message };
  }

  const [thread] = await db
    .select({
      id: forumThreads.id,
      kind: forumThreads.kind,
      title: forumThreads.title,
      categoryId: forumThreads.categoryId,
      ownerId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(forumThreads)
    .innerJoin(users, eq(users.id, forumThreads.userId))
    .where(eq(forumThreads.id, parsed.data.threadId))
    .limit(1);
  if (!thread) {
    await logAudit({
      actorId: auth.user.id,
      action: "forum.denied",
      details: { reason: "thread_not_found", op: "post.create", threadId: parsed.data.threadId },
    });
    return { error: "השאלה לא נמצאה" };
  }
  if (thread.categoryId && !(await userCanUseUnitForum(auth.user, thread.categoryId))) {
    await logAudit({
      actorId: auth.user.id,
      action: "forum.denied",
      details: { reason: "no_unit_access", op: "post.create", threadId: thread.id },
    });
    return { error: "הפורום פתוח למנויות ולמי ששילמה על קובץ ביחידה הזו" };
  }
  if (thread.kind !== "question") {
    return { error: "אפשר להשיב רק על שאלה" };
  }

  await db.insert(forumPosts).values({
    threadId: thread.id,
    userId: auth.user.id,
    body: parsed.data.body,
  });

  await logAudit({
    actorId: auth.user.id,
    action: "forum.post.create",
    entityType: "forum_thread",
    entityId: thread.id,
  });

  // התראה במייל לבעלת השאלה (לא כשהיא עונה לעצמה)
  if (thread.ownerId !== auth.user.id) {
    sendMailInBackground({
      to: thread.ownerEmail,
      ...templates.forumReply(thread.ownerName, thread.title, forumAuthor(auth.user.personalCode), thread.id),
      kind: "forum_reply",
      userId: thread.ownerId,
    });
  }

  await revalidateUnit(thread.categoryId);
  return { ok: true };
}

/** מחיקה – מי שכתבה את ההודעה, או המנהלת (שאלה/הערה/טיפ; מחיקת שאלה מוחקת גם את תשובותיה) */
export async function deleteThread(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  const id = Number(form.get("id"));
  if (!user || !Number.isInteger(id) || id <= 0) return;

  const isAdmin = user.role === "admin";
  const [gone] = await db
    .delete(forumThreads)
    .where(isAdmin ? eq(forumThreads.id, id) : and(eq(forumThreads.id, id), eq(forumThreads.userId, user.id)))
    .returning({ categoryId: forumThreads.categoryId, authorId: forumThreads.userId });
  if (!gone) return;

  await logAudit({
    actorId: user.id,
    action: "forum.thread.delete",
    entityType: "forum_thread",
    entityId: id,
    details: isAdmin && gone.authorId !== user.id ? { byAdmin: true, authorId: gone.authorId } : undefined,
  });
  await revalidateUnit(gone.categoryId);
}

/** מחיקת תשובה – מי שכתבה אותה, או המנהלת */
export async function deleteReply(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  const id = Number(form.get("id"));
  if (!user || !Number.isInteger(id) || id <= 0) return;

  const isAdmin = user.role === "admin";
  const [gone] = await db
    .delete(forumPosts)
    .where(isAdmin ? eq(forumPosts.id, id) : and(eq(forumPosts.id, id), eq(forumPosts.userId, user.id)))
    .returning({ threadId: forumPosts.threadId, authorId: forumPosts.userId });
  if (!gone) return;

  await logAudit({
    actorId: user.id,
    action: "forum.post.delete",
    entityType: "forum_post",
    entityId: id,
    details: isAdmin && gone.authorId !== user.id ? { byAdmin: true, authorId: gone.authorId } : undefined,
  });
  const [thread] = await db
    .select({ categoryId: forumThreads.categoryId })
    .from(forumThreads)
    .where(eq(forumThreads.id, gone.threadId))
    .limit(1);
  await revalidateUnit(thread?.categoryId ?? null);
}

/** דיווח על תוכן לא הולם – על הודעה (threadId) או על תשובה (postId). המנהלת רואה ב-/admin/forum */
export async function reportContent(_prev: ForumState, form: FormData): Promise<ForumState> {
  const auth = await requirePremiumUser("report.create");
  if ("error" in auth) return { error: auth.error };

  const threadId = Number(form.get("threadId")) || null;
  const postId = Number(form.get("postId")) || null;
  if ((threadId === null) === (postId === null)) return { error: "הדיווח לא תקין" };

  // בודקים שהתוכן קיים, ומביאים מי כתבה (לא מדווחים על עצמך)
  const [target] = threadId
    ? await db
        .select({ userId: forumThreads.userId, body: forumThreads.body })
        .from(forumThreads)
        .where(eq(forumThreads.id, threadId))
        .limit(1)
    : await db
        .select({ userId: forumPosts.userId, body: forumPosts.body })
        .from(forumPosts)
        .where(eq(forumPosts.id, postId!))
        .limit(1);
  if (!target) return { error: "התוכן כבר לא קיים" };
  if (target.userId === auth.user.id) return { error: "אי אפשר לדווח על הודעה שכתבת בעצמך" };

  const sameTarget = and(
    eq(forumReports.reporterId, auth.user.id),
    threadId ? eq(forumReports.threadId, threadId) : eq(forumReports.postId, postId!),
  );

  // ביטול דיווח: מוחקים רק דיווח שעדיין ממתין לטיפול (אחרי שהמנהלת טיפלה – אין מה לבטל)
  if (form.get("cancel") === "1") {
    const removed = await db
      .delete(forumReports)
      .where(and(sameTarget, eq(forumReports.status, "open")))
      .returning({ id: forumReports.id });
    if (removed.length > 0) {
      await logAudit({
        actorId: auth.user.id,
        action: "forum.report_cancel",
        entityType: threadId ? "forum_thread" : "forum_post",
        entityId: threadId ?? postId,
      });
    }
    return { ok: true, reported: false };
  }

  // לא מכפילים: אם כבר יש דיווח פתוח שלה על אותו תוכן – לא מוסיפים עוד אחד
  const [existing] = await db
    .select({ id: forumReports.id })
    .from(forumReports)
    .where(and(sameTarget, eq(forumReports.status, "open")))
    .limit(1);
  if (existing) return { ok: true, reported: true };

  const inserted = await db
    .insert(forumReports)
    .values({ reporterId: auth.user.id, threadId, postId })
    .returning({ id: forumReports.id });

  if (inserted.length > 0) {
    await logAudit({
      actorId: auth.user.id,
      action: "forum.report",
      entityType: threadId ? "forum_thread" : "forum_post",
      entityId: threadId ?? postId,
    });
    const to = adminEmail();
    if (to) {
      sendMailInBackground({
        to,
        subject: "דיווח על תוכן לא הולם בפורום",
        text: "התקבל דיווח חדש על תוכן בפורום. לטיפול: /admin/forum",
        kind: "forum_report",
      });
    }
  }
  return { ok: true, reported: true };
}
