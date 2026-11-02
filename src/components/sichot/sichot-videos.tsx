import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sichaVideos, sichaVideoLinks, sichaVideoIdeas, sichaUsages, sichot, users, type User } from "@/db/schema";
import { getCategoryChain, chainToHref } from "@/lib/data";
import { SichaVideoForm } from "./sicha-video-form";
import { CopyrightReport } from "./copyright-report";
import { SichaVideoCard, SichaVideoListCard, type SichaVideoCardData } from "./sicha-video-card";

/** תיקיית "סרטונים" במאגר השיחות: סרטונים שמורות שיתפו מהדרייב שלהן (האתר מעתיק אותם לדרייב שלו) */
export async function SichotVideos({
  categoryId,
  path,
  user,
  videoId,
}: {
  categoryId: number;
  path: string;
  user: User | null;
  /** מזהה סרטון פתוח (?video=) – מציג את דף הסרטון במקום הרשימה */
  videoId?: number;
}) {
  const rows = await db
    .select({
      id: sichaVideos.id,
      title: sichaVideos.title,
      description: sichaVideos.description,
      driveId: sichaVideos.driveId,
      linkKind: sichaVideos.linkKind,
      displayName: sichaVideos.displayName,
      teacherId: sichaVideos.teacherId,
      teacherName: users.name,
    })
    .from(sichaVideos)
    .innerJoin(users, eq(users.id, sichaVideos.teacherId))
    .where(and(eq(sichaVideos.categoryId, categoryId), eq(sichaVideos.status, "active")))
    .orderBy(desc(sichaVideos.createdAt));

  // השיעורים שכל סרטון מתאים להם (עם קישור לדף השיעור) וכמה מורות שונות סימנו שהשתמשו בהם
  const lessonsByVideo = new Map<number, { id: number; title: string; href: string }[]>();
  const teachersByVideo = new Map<number, Set<number>>();
  if (rows.length) {
    const links = await db
      .select({ videoId: sichaVideoLinks.videoId, sichaId: sichot.id, title: sichot.title, categoryId: sichot.categoryId })
      .from(sichaVideoLinks)
      .innerJoin(sichot, eq(sichot.id, sichaVideoLinks.sichaId))
      .where(and(inArray(sichaVideoLinks.videoId, rows.map((r) => r.id)), eq(sichot.status, "active")));
    const hrefByCat = new Map<number, string>();
    for (const catId of new Set(links.map((l) => l.categoryId))) {
      hrefByCat.set(catId, chainToHref(await getCategoryChain(catId)));
    }
    for (const l of links) {
      lessonsByVideo.set(l.videoId, [
        ...(lessonsByVideo.get(l.videoId) ?? []),
        { id: l.sichaId, title: l.title, href: `${hrefByCat.get(l.categoryId)}?sicha=${l.sichaId}` },
      ]);
    }
    const sichaIds = [...new Set(links.map((l) => l.sichaId))];
    const usages = sichaIds.length
      ? await db
          .select({ sichaId: sichaUsages.sichaId, teacherId: sichaUsages.teacherId })
          .from(sichaUsages)
          .where(inArray(sichaUsages.sichaId, sichaIds))
      : [];
    for (const l of links) {
      const set = teachersByVideo.get(l.videoId) ?? new Set<number>();
      for (const u of usages) if (u.sichaId === l.sichaId) set.add(u.teacherId);
      teachersByVideo.set(l.videoId, set);
    }
  }

  // רעיונות "למה זה מתאים" – נטענים רק לסרטון הפתוח
  const ideasByVideo = new Map<number, { id: number; body: string; teacherName: string }[]>();
  if (videoId && rows.some((r) => r.id === videoId)) {
    const ideaRows = await db
      .select({ id: sichaVideoIdeas.id, body: sichaVideoIdeas.body, teacherName: users.name })
      .from(sichaVideoIdeas)
      .innerJoin(users, eq(users.id, sichaVideoIdeas.teacherId))
      .where(eq(sichaVideoIdeas.videoId, videoId))
      .orderBy(sichaVideoIdeas.createdAt);
    ideasByVideo.set(videoId, ideaRows);
  }

  const cards: SichaVideoCardData[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    driveId: r.driveId,
    linkKind: r.linkKind,
    teacherName: r.displayName ?? r.teacherName,
    canDelete: user?.role === "admin",
    ideas: ideasByVideo.get(r.id) ?? [],
    usageCount: teachersByVideo.get(r.id)?.size ?? 0,
    lessons: lessonsByVideo.get(r.id) ?? [],
  }));

  return (
    <SichotVideosView cards={cards} categoryId={categoryId} path={path} canShare={!!user} openId={videoId} />
  );
}

/** חלק התצוגה בלבד (גם לעמוד הדוגמה בפיתוח) */
export function SichotVideosView({
  cards,
  categoryId,
  path,
  canShare,
  openId,
}: {
  cards: SichaVideoCardData[];
  categoryId: number;
  path: string;
  canShare: boolean;
  openId?: number;
}) {
  const opened = openId ? cards.find((c) => c.id === openId) : undefined;
  if (opened) {
    return (
      <div className="space-y-5">
        <Link href={path} className="sicha-tag">
          <ArrowRight className="h-4 w-4" aria-hidden /> חזרה לכל הסרטונים
        </Link>
        <div className="max-w-lg">
          <SichaVideoCard video={opened} path={path} />
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="sicha-videos-h">
      <h2 id="sicha-videos-h" className="sr-only">
        סרטונים לשיעורים
      </h2>

      {canShare ? (
        <SichaVideoForm categoryId={categoryId} path={path} />
      ) : (
        <div className="gate-card text-lg">יש להתחבר כדי לשתף סרטון.</div>
      )}

      {cards.length === 0 ? (
        <div className="gate-card p-8 text-center">
          <p className="text-2xl">עדיין אין כאן סרטונים.</p>
          <p className="mt-1 text-lg gate-soft">היי הראשונה ששולחת קישור לסרטון מהדרייב!</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((v) => (
            <SichaVideoListCard key={v.id} video={v} href={`${path}?video=${v.id}`} />
          ))}
        </div>
      )}

      <CopyrightReport />
    </section>
  );
}
