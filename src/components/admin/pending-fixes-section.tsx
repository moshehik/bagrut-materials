import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes, materials, users } from "@/db/schema";
import { FixPublishForm } from "@/components/admin/fix-publish-form";

/** בקשות תיקון שממתינות לטיפול – משותף ל-/admin/fixes ול-/admin/inbox */
export async function PendingFixesSection({ title = "ממתינות לטיפול" }: { title?: string }) {
  const pending = await db
    .select({
      id: materialFixes.id,
      requestText: materialFixes.requestText,
      quoteText: materialFixes.quoteText,
      createdAt: materialFixes.createdAt,
      materialTitle: materials.title,
      fileName: materials.fileName,
      userName: users.name,
    })
    .from(materialFixes)
    .innerJoin(materials, eq(materials.id, materialFixes.materialId))
    .leftJoin(users, eq(users.id, materialFixes.userId))
    .where(eq(materialFixes.status, "pending"))
    .orderBy(desc(materialFixes.createdAt));

  return (
    <section>
      <h3 className="mb-2 font-bold">
        {title} ({pending.length})
      </h3>
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
              {r.quoteText ? (
                <div className="mt-2 text-sm leading-7">
                  <span className="text-xs text-muted">המורה סימנה: </span>
                  <span className="whitespace-pre-wrap rounded bg-[#e9d08a] px-1">{r.quoteText}</span>
                  <span className="mx-2 text-muted">←</span>
                  <span className="text-xs text-muted">התיקון שהציעה: </span>
                  <span className="whitespace-pre-wrap rounded bg-[#9ac7bc] px-1">{r.requestText}</span>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.requestText}</p>
              )}
              {/\.docx$/i.test(r.fileName) ? (
                <FixPublishForm id={r.id} defaultOriginal={r.quoteText ?? ""} defaultCorrected={r.quoteText ? r.requestText : ""} />
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
  );
}
