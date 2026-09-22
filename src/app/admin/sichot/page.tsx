import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sichot, sichaTeacherStatus, users, categories } from "@/db/schema";
import { SICHA_SEMINARS } from "@/lib/constants";
import { SichaModerationButtons } from "@/components/admin/sicha-moderation-buttons";

export const dynamic = "force-dynamic";

export default async function AdminSichotPage() {
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

  const blockedTeachers = await db
    .select({ teacherId: sichaTeacherStatus.teacherId, name: users.name, nextDueAt: sichaTeacherStatus.nextDueAt })
    .from(sichaTeacherStatus)
    .innerJoin(users, eq(users.id, sichaTeacherStatus.teacherId))
    .where(eq(sichaTeacherStatus.blocked, true));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">שיחות מורות</h2>
        <span className="chip bg-blue-soft text-blue-deep">{rows.length} שיחות</span>
        <span className="text-xs text-muted ms-auto">
          פרסום פתוח — עולה מיד לכולן; כאן ניתן להשעות/למחוק בדיעבד בלבד
        </span>
      </div>

      {blockedTeachers.length > 0 && (
        <div className="card p-4 bg-pink-soft/40">
          <h3 className="font-bold text-sm mb-2">מורות חסומות ממאגר השיחות ({blockedTeachers.length})</h3>
          <ul className="text-sm space-y-1">
            {blockedTeachers.map((t) => (
              <li key={t.teacherId}>{t.name}</li>
            ))}
          </ul>
        </div>
      )}

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
                    {SICHA_SEMINARS[r.seminarType].icon} {SICHA_SEMINARS[r.seminarType].label}
                  </span>
                </div>
                <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3">
                  <span>{r.teacherName}</span>
                  <span dir="ltr">{r.teacherEmail}</span>
                  {r.categoryTitle && <span>· {r.categoryTitle}</span>}
                  <span>· {r.createdAt.toLocaleDateString("he-IL")}</span>
                </div>
              </div>
              <SichaModerationButtons id={r.id} title={r.title} status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
