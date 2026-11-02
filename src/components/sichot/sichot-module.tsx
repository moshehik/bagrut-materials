import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sichot, sichaFiles, sichaUsages, sichaIdeas, sichaVideos, sichaVideoLinks, categories, users, type User } from "@/db/schema";
import { SichaIntro } from "./sicha-intro";
import { SichaUploadForm } from "./sicha-upload-form";
import { SichaCard, SichaListCard, type SichaCardData } from "./sicha-card";

export async function SichotModule({
  categoryId,
  folderTitle,
  path,
  user,
  sichaId,
}: {
  categoryId: number;
  folderTitle: string;
  path: string;
  user: User | null;
  /** מזהה שיחה פתוחה (?sicha=) – מציג את דף השיעור במקום הרשימה */
  sichaId?: number;
}) {
  const items = await db
    .select({
      id: sichot.id,
      title: sichot.title,
      description: sichot.description,
      seminarType: sichot.seminarType,
      fileName: sichot.fileName,
      createdAt: sichot.createdAt,
      displayName: sichot.displayName,
      teacherId: sichot.teacherId,
      teacherName: users.name,
      usageCount: sql<number>`count(distinct ${sichaUsages.id})::int`,
    })
    .from(sichot)
    .innerJoin(users, eq(users.id, sichot.teacherId))
    .leftJoin(sichaUsages, eq(sichaUsages.sichaId, sichot.id))
    .where(and(eq(sichot.categoryId, categoryId), eq(sichot.status, "active")))
    .groupBy(sichot.id, users.name, sichot.displayName)
    // הכי בשימוש קודם, ואז החדשות
    .orderBy(desc(sql`count(distinct ${sichaUsages.id})`), desc(sichot.createdAt));

  const ids = items.map((it) => it.id);

  const [videoRows, [thisCat]] = await Promise.all([
    ids.length
      ? db
          .select({ id: sichaVideos.id, title: sichaVideos.title, sichaId: sichaVideoLinks.sichaId })
          .from(sichaVideoLinks)
          .innerJoin(sichaVideos, eq(sichaVideos.id, sichaVideoLinks.videoId))
          .where(and(inArray(sichaVideoLinks.sichaId, ids), eq(sichaVideos.status, "active")))
          .orderBy(asc(sichaVideos.createdAt))
      : Promise.resolve([]),
    db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, categoryId)).limit(1),
  ]);
  // תיקיית "סרטונים להעשרת שיעורים": אחות של "שיעורי יהדות" (שבתוכה תיקיית השיחות הזו), באותו מקצוע — אליה מובילים כפתורי הסרטונים
  const [lessonsParent] = thisCat?.parentId
    ? await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, thisCat.parentId)).limit(1)
    : [];
  const [videosCat] = lessonsParent?.parentId
    ? await db
        .select({ slug: categories.slug })
        .from(categories)
        .where(and(eq(categories.parentId, lessonsParent.parentId), eq(categories.contentModule, "sichot_videos")))
        .limit(1)
    : [];
  const videosBase = videosCat ? `${path.split("/").slice(0, -2).join("/")}/${videosCat.slug}` : null;
  const videosBySicha = new Map<number, { id: number; title: string }[]>();
  for (const v of videoRows) {
    if (v.sichaId === null) continue;
    videosBySicha.set(v.sichaId, [...(videosBySicha.get(v.sichaId) ?? []), { id: v.id, title: v.title }]);
  }

  const [extraRows, myUsages, ideaRows] = await Promise.all([
    ids.length
      ? db
          .select({ id: sichaFiles.id, sichaId: sichaFiles.sichaId, fileName: sichaFiles.fileName })
          .from(sichaFiles)
          .where(inArray(sichaFiles.sichaId, ids))
          .orderBy(asc(sichaFiles.sort), asc(sichaFiles.id))
      : Promise.resolve([]),
    user && ids.length
      ? db
          .select({ sichaId: sichaUsages.sichaId })
          .from(sichaUsages)
          .where(and(eq(sichaUsages.teacherId, user.id), inArray(sichaUsages.sichaId, ids)))
      : Promise.resolve([]),
    ids.length
      ? db
          .select({
            id: sichaIdeas.id,
            sichaId: sichaIdeas.sichaId,
            body: sichaIdeas.body,
            teacherId: sichaIdeas.teacherId,
            teacherName: users.name,
          })
          .from(sichaIdeas)
          .innerJoin(users, eq(users.id, sichaIdeas.teacherId))
          .where(inArray(sichaIdeas.sichaId, ids))
          .orderBy(asc(sichaIdeas.createdAt))
      : Promise.resolve([]),
  ]);

  const extrasBySicha = new Map<number, { id: number; fileName: string }[]>();
  for (const f of extraRows) extrasBySicha.set(f.sichaId, [...(extrasBySicha.get(f.sichaId) ?? []), { id: f.id, fileName: f.fileName }]);
  const myUsageSet = new Set(myUsages.map((u) => u.sichaId));
  const ideasBySicha = new Map<number, { id: number; body: string; teacherName: string; teacherId: number }[]>();
  for (const idea of ideaRows) {
    const list = ideasBySicha.get(idea.sichaId) ?? [];
    list.push(idea);
    ideasBySicha.set(idea.sichaId, list);
  }

  const cards: SichaCardData[] = items.map((it) => {
    const ideas = ideasBySicha.get(it.id) ?? [];
    return {
      id: it.id,
      title: it.title,
      description: it.description,
      seminarType: it.seminarType,
      fileName: it.fileName,
      extraFiles: extrasBySicha.get(it.id) ?? [],
      teacherName: it.displayName ?? it.teacherName,
      usageCount: it.usageCount,
      usedByMe: myUsageSet.has(it.id),
      ideas: ideas.map((i) => ({ id: i.id, body: i.body, teacherName: i.teacherName })),
      ideaContributorCount: new Set(ideas.map((i) => i.teacherId)).size,
      videos: videosBase ? (videosBySicha.get(it.id) ?? []).map((v) => ({ id: v.id, title: v.title, href: `${videosBase}?video=${v.id}` })) : [],
    };
  });

  // ?sicha=<id>: דף השיעור עצמו (במקום הרשימה)
  const opened = sichaId ? cards.find((c) => c.id === sichaId) : undefined;
  if (opened) {
    return (
      <div className="space-y-5">
        <Link href={path} className="sicha-tag">
          <ArrowRight className="h-4 w-4" aria-hidden /> חזרה לכל השיחות ב{folderTitle}
        </Link>
        <div className="max-w-lg">
          <SichaCard sicha={opened} path={path} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SichaIntro folderTitle={folderTitle} />

      {user ? (
        <SichaUploadForm categoryId={categoryId} path={path} />
      ) : (
        <div className="gate-card text-lg">יש להתחבר כדי להעלות שיחה, להוריד ולהוסיף רעיונות.</div>
      )}

      {cards.length === 0 ? (
        <div className="gate-card p-10 text-center">
          <div className="text-5xl">🪄</div>
          <p className="mt-3 text-2xl">עדיין אין כאן שיחות.</p>
          <p className="mt-1 text-lg gate-soft">היי הראשונה שמעלה שיחה לתיקייה הזו!</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((sicha) => (
            <SichaListCard key={sicha.id} sicha={sicha} href={`${path}?sicha=${sicha.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
