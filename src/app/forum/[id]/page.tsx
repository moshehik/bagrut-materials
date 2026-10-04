import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { forumThreads } from "@/db/schema";
import { getCategoryChain, chainToHref } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * הפורום מוטמע בכל יחידת לימוד – אין עוד עמוד נפרד לכל הודעה.
 * הקישור הישן (למשל מייל התראה על תשובה) מוביל ליחידה עצמה, אל ההודעה המדויקת.
 * (/forum/:path+ דורש התחברות – ר' proxy.ts)
 */
export default async function ForumThreadRedirect({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [t] = await db
    .select({ categoryId: forumThreads.categoryId })
    .from(forumThreads)
    .where(eq(forumThreads.id, id))
    .limit(1);
  if (!t) notFound();

  const chain = t.categoryId ? await getCategoryChain(t.categoryId) : [];
  redirect(chain.length > 0 ? `${chainToHref(chain)}#t-${id}` : "/subjects");
}
