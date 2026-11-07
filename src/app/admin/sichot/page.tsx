import { requireAdminPage } from "@/lib/session";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sichot, sichaVideos, users, categories } from "@/db/schema";
import { driveLinkUrl } from "@/lib/drive-link";
import { SICHA_SEMINARS } from "@/lib/constants";
import { SeminarIcon } from "@/components/sichot/seminar-icon";
import { SichaModerationButtons } from "@/components/admin/sicha-moderation-buttons";

export const dynamic = "force-dynamic";

export default async function AdminSichotPage() {
  await requireAdminPage();
  const rows = await db
    .select({
      id: sichot.id,
      title: sichot.title,
      status: sichot.status,
      seminarType: sichot.seminarType,
      createdAt: sichot.createdAt,
      teacherName: users.name,
      teacherEmail: users.email,
      categoryTitle: categories.title,
    })
    .from(sichot)
    .innerJoin(users, eq(users.id, sichot.teacherId))
    .leftJoin(categories, eq(categories.id, sichot.categoryId))
    .orderBy(desc(sichot.createdAt));

  const videoRows = await db
    .select({
      id: sichaVideos.id,
      title: sichaVideos.title,
      status: sichaVideos.status,
      driveId: sichaVideos.driveId,
      linkKind: sichaVideos.linkKind,
      displayName: sichaVideos.displayName,
      createdAt: sichaVideos.createdAt,
      teacherName: users.name,
      teacherEmail: users.email,
      categoryTitle: categories.title,
    })
    .from(sichaVideos)
    .innerJoin(users, eq(users.id, sichaVideos.teacherId))
    .leftJoin(categories, eq(categories.id, sichaVideos.categoryId))
    .orderBy(desc(sichaVideos.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">שיחות מורות</h2>
        <span className="chip bg-blue-soft text-blue-deep">{rows.length} שיחות</span>
        <span className="text-xs text-muted ms-auto">
          פרסום פתוח — עולה מיד לכולן; כאן ניתן להשעות/למחוק בדיעבד בלבד
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">אין עדיין שיחות במאגר.</div>
      ) : (
        <ul className="card divide-y divide-foreground/5">
          {rows.map((r) => (
            <li key={r.id} className="p-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{r.title}</span>
                  {r.status !== "active" && <span className="chip bg-red-100 text-red-700">מושהה</span>}
                  <span className="chip bg-gold-soft text-[#7a5b00]">
                    <SeminarIcon type={r.seminarType} className="h-3.5 w-3.5" /> {SICHA_SEMINARS[r.seminarType].label}
                  </span>
                </div>
                <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3">
                  <span>{r.teacherName}</span>
                  <span dir="ltr">{r.teacherEmail}</span>
                  {r.categoryTitle && <span>· {r.categoryTitle}</span>}
                  <span>· {r.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
                </div>
              </div>
              <SichaModerationButtons id={r.id} title={r.title} status={r.status} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <h2 className="font-display text-2xl font-bold">סרטונים לשיעורים</h2>
        <span className="chip bg-blue-soft text-blue-deep">{videoRows.length} סרטונים</span>
      </div>
      {videoRows.length === 0 ? (
        <div className="card p-8 text-center text-muted">אין עדיין סרטונים.</div>
      ) : (
        <ul className="card divide-y divide-foreground/5">
          {videoRows.map((r) => (
            <li key={r.id} className="p-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{r.title}</span>
                  {r.status !== "active" && <span className="chip bg-red-100 text-red-700">מושהה</span>}
                  <a
                    href={driveLinkUrl(r.driveId, r.linkKind)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip bg-gold-soft text-[#7a5b00]"
                  >
                    {r.linkKind === "folder" ? "תיקייה" : "קובץ"} בדרייב
                  </a>
                </div>
                <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3">
                  <span>{r.teacherName}</span>
                  {r.displayName && <span>(מוצגת כ: {r.displayName})</span>}
                  <span dir="ltr">{r.teacherEmail}</span>
                  {r.categoryTitle && <span>· {r.categoryTitle}</span>}
                  <span>· {r.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
                </div>
              </div>
              <SichaModerationButtons id={r.id} title={r.title} status={r.status} kind="video" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
