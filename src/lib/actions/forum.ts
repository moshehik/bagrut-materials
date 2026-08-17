"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { forumPosts, forumThreads } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { userHasPremium } from "@/lib/data";

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
  categoryId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
});

export async function createThread(_prev: ForumState, form: FormData): Promise<ForumState> {
  const auth = await requirePremiumUser();
  if ("error" in auth) return { error: auth.error };

  const parsed = threadSchema.safeParse({
    title: form.get("title"),
    body: form.get("body"),
    categoryId: form.get("categoryId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [t] = await db
    .insert(forumThreads)
    .values({
      userId: auth.user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      categoryId: parsed.data.categoryId ?? null,
    })
    .returning({ id: forumThreads.id });

  revalidatePath("/forum");
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
    .select({ id: forumThreads.id })
    .from(forumThreads)
    .where(eq(forumThreads.id, parsed.data.threadId))
    .limit(1);
  if (!thread) return { error: "הדיון לא נמצא" };

  await db.insert(forumPosts).values({
    threadId: thread.id,
    userId: auth.user.id,
    body: parsed.data.body,
  });

  revalidatePath(`/forum/${thread.id}`);
  revalidatePath("/forum");
  return { ok: true };
}
