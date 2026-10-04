import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes, materials, users } from "@/db/schema";
import { FixPublishForm, UnpublishFixButton } from "@/components/admin/fix-publish-form";

export const dynamic = "force-dynamic";

export default async function AdminFixesPage() {
  const rows = await db
    .select({
      id: materialFixes.id,
      status: materialFixes.status,
      fixNumber: materialFixes.fixNumber,
      requestText: materialFixes.requestText,
      quoteText: materialFixes.quoteText,
      originalText: materialFixes.originalText,
      correctedText: materialFixes.correctedText,
      createdAt: materialFixes.createdAt,
      materialId: materialFixes.materialId,
      materialTitle: materials.title,
      fileName: materials.fileName,
      userName: users.name,
    })
    .from(materialFixes)
    .innerJoin(materials, eq(materials.id, materialFixes.materialId))
    .leftJoin(users, eq(users.id, materialFixes.userId))
    .orderBy(desc(materialFixes.createdAt));

  const pending = rows.filter((r) => r.status === "pending");
  const published = rows.filter((r) => r.status === "published");
  const rejected = rows.filter((r) => r.status === "rejected");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">בקשות שינוי ותיקונים</h2>
        <span className="chip bg-gold-soft text-[#7a5b00]">{pending.length} ממתינות</span>
        <span className="chip bg-blue-soft text-blue-deep">{published.length} מפורסמים</span>
      </div>

      <section>
        <h3 className="mb-2 font-bold">ממתינות לטיפול</h3>
        {pending.length === 0 ? (
          <div className="card p-6 text-center text-muted">אין בקשות ממתינות.</div>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <b>{r.materialTitle}</b>
                  <span className="text-xs text-muted">{r.fileName}</span>
                  <span className="text-xs text-muted">
                    {r.userName ?? "—"} · {r.createdAt.toLocaleDateString("he-IL")}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.requestText}</p>
                {r.quoteText && (
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-[#ffc2dc]/60 px-2 py-1 text-sm">{r.quoteText}</p>
                )}
                {/\.docx$/i.test(r.fileName) ? (
                  <FixPublishForm id={r.id} defaultOriginal={r.quoteText ?? ""} />
                ) : (
                  <p className="mt-3 text-sm text-red-700">
                    הקובץ אינו Word – תיקון מסומן נתמך רק ב-docx. את השינוי יש לבצע ידנית בקובץ.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-bold">תיקונים מפורסמים</h3>
        {published.length === 0 ? (
          <div className="card p-6 text-center text-muted">עדיין לא פורסמו תיקונים.</div>
        ) : (
          <ul className="card divide-y divide-foreground/5">
            {published.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 p-4">
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#3f6aa0] px-1 text-sm font-bold text-white">
                  {r.fixNumber}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold">{r.materialTitle}</div>
                  <div className="mt-1 leading-7">
                    <span className="rounded bg-[#ffc2dc] px-1">{r.originalText}</span>
                    <span className="mx-2 text-muted">←</span>
                    <span className="rounded bg-[#bfe9f7] px-1">{r.correctedText}</span>
                  </div>
                </div>
                <UnpublishFixButton id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {rejected.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer font-bold">נדחו ({rejected.length})</summary>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            {rejected.map((r) => (
              <li key={r.id}>
                {r.materialTitle}: {r.requestText}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
