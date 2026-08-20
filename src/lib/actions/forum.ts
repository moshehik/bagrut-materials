"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, forumPosts, forumThreads, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { userHasPremium } from "@/lib/data";
import { sendMailInBackground, templates } from "@/lib/mail";

export type ForumState = { error?: string; ok?: boolean } | undefined;

async function requirePremiumUser() {
  const user = await getCurrentUser();
  if (!user) return { error: "יש להתחבר כדי לכתוב בפורום" } as const;
  if (!(await userHasPremium(user))) {
    return { error: "הפורום פתוח למנויות פרימיום בלבד" } as const;
  }
  return { user } as const;
}

const threadSchema = z.object({
  title: z.string().trim().min(4, "כותרת קצרה מדי").max(200, "כותרת ארוכה מדי"),
  body: z.string().trim().min(10, "כתבי לפחות כמה מילים").max(8000, "ההודעה ארוכה מדי"),
  // כל דיון שייך ליחידת לימוד – אין שאלות "כלליות"
  categoryId: z.coerce.number().int().positive(),
});

export async function createThread(_prev: ForumState, form: FormData): Promise<ForumState> {
  const auth = await requirePremiumUser();
  if ("error" in auth) return { error: auth.error };

  const parsed = threadSchema.safeParse({
    title: form.get("title"),
    body: form.get("body"),
    categoryId: form.get("categoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, parsed.data.categoryId))
    .limit(1);
  if (!cat) return { error: "יחידת הלימוד לא נמצאה" };

  const [t] = await db
    .insert(forumThreads)
    .values({
      userId: auth.user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      categoryId: parsed.data.categoryId,
    })
    .returning({ id: forumThreads.id });

  redirect(`/forum/${t.id}`);
}

const replySchema = z.object({
  threadId: z.coerce.number().int().positive(),
  body: z.string().trim().min(2, "התגובה קצרה מדי").max(8000, "התגובה ארוכה מדי"),
});

export async function replyThread(_prev: ForumState, form: FormData): Promise<ForumState> {
  const auth = await requirePremiumUser();
  if ("error" in auth) return { error: auth.error };

  const parsed = replySchema.safeParse({ threadId: form.get("threadId"), body: form.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [thread] = await db
    .select({
      id: forumThreads.id,
      title: forumThreads.title,
      ownerId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(forumThreads)
    .innerJoin(users, eq(users.id, forumThreads.userId))
    .where(eq(forumThreads.id, parsed.data.threadId))
    .limit(1);
  if (!thread) return { error: "הדיון לא נמצא" };

  await db.insert(forumPosts).values({
    threadId: thread.id,
    userId: auth.user.id,
    body: parsed.data.body,
  });

  // התראה במייל לבעלת השאלה (לא כשהיא עונה לעצמה)
  if (thread.ownerId !== auth.user.id) {
    sendMailInBackground({
      to: thread.ownerEmail,
      ...templates.forumReply(thread.ownerName, thread.title, auth.user.name, thread.id),
      kind: "forum_reply",
      userId: thread.ownerId,
    });
  }

  revalidatePath(`/forum/${thread.id}`);
  return { ok: true };
}
