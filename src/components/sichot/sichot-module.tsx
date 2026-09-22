import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sichot, sichaRatings, sichaUsages, sichaIdeas, sichaTeacherStatus, users, type User } from "@/db/schema";
import { SichaIntro } from "./sicha-intro";
import { SichaBlockedBanner } from "./sicha-blocked-banner";
import { SichaUploadForm } from "./sicha-upload-form";
import { SichaCard, type SichaCardData } from "./sicha-card";

export async function SichotModule({
  categoryId,
  folderTitle,
  path,
  user,
}: {
  categoryId: number;
  folderTitle: string;
  path: string;
  user: User | null;
}) {
  if (user) {
    const [status] = await db
      .select({ blocked: sichaTeacherStatus.blocked })
      .from(sichaTeacherStatus)
      .where(eq(sichaTeacherStatus.teacherId, user.id))
      .limit(1);
    if (status?.blocked) {
      return (
        <div className="space-y-8">
          <SichaIntro folderTitle={folderTitle} />
          <SichaBlockedBanner categoryId={categoryId} path={path} />
        </div>
      );
    }
  }

  const items = await db
    .select({
      id: sichot.id,
      title: sichot.title,
      description: sichot.description,
      seminarType: sichot.seminarType,
      fileName: sichot.fileName,
      createdAt: sichot.createdAt,
      teacherId: sichot.teacherId,
      teacherName: users.name,
      avgStars: sql<string | null>`avg(${sichaRatings.stars})`,
      ratingCount: sql<number>`count(distinct ${sichaRatings.id})::int`,
      usageCount: sql<number>`count(distinct ${sichaUsages.id})::int`,
    })
    .from(sichot)
    .innerJoin(users, eq(users.id, sichot.teacherId))
    .leftJoin(sichaRatings, eq(sichaRatings.sichaId, sichot.id))
    .leftJoin(sichaUsages, eq(sichaUsages.sichaId, sichot.id))
    .where(and(eq(sichot.categoryId, categoryId), eq(sichot.status, "active")))
    .groupBy(sichot.id, users.name)
    .orderBy(
      desc(sql`coalesce(avg(${sichaRatings.stars}),0)`),
      desc(sql`count(distinct ${sichaRatings.id})`),
      desc(sichot.createdAt),
    );

  const ids = items.map((it) => it.id);

  const [myRatings, myUsages, ideaRows] = await Promise.all([
    user && ids.length
      ? db
          .select({ sichaId: sichaRatings.sichaId, stars: sichaRatings.stars })
          .from(sichaRatings)
          .where(and(eq(sichaRatings.teacherId, user.id), inArray(sichaRatings.sichaId, ids)))
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

  const myRatingMap = new Map(myRatings.map((r) => [r.sichaId, r.stars]));
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
      teacherName: it.teacherName,
      avgStars: it.avgStars !== null ? Number(it.avgStars) : null,
      ratingCount: it.ratingCount,
      usageCount: it.usageCount,
      myRating: myRatingMap.get(it.id) ?? null,
      usedByMe: myUsageSet.has(it.id),
      ideas: ideas.map((i) => ({ id: i.id, body: i.body, teacherName: i.teacherName })),
      ideaContributorCount: new Set(ideas.map((i) => i.teacherId)).size,
    };
  });

  return (
    <div className="space-y-8">
      <SichaIntro folderTitle={folderTitle} />

      {user ? (
        <SichaUploadForm categoryId={categoryId} path={path} />
      ) : (
        <div className="card p-5 text-sm text-muted">יש להתחבר כדי להעלות שיחה, לדרג ולהוסיף רעיונות.</div>
      )}

      {cards.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          <div className="text-5xl">🪄</div>
          <p className="mt-3 font-semibold text-foreground">עדיין אין כאן שיחות.</p>
          <p className="mt-1 text-sm">היי הראשונה שמעלה שיחה לתיקייה הזו!</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((sicha) => (
            <SichaCard key={sicha.id} sicha={sicha} path={path} />
          ))}
        </div>
      )}
    </div>
  );
}
