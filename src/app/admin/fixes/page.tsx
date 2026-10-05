import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes, materials, users } from "@/db/schema";
import { UnpublishFixButton } from "@/components/admin/fix-publish-form";
import { PendingFixesSection } from "@/components/admin/pending-fixes-section";

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
  const merged = rows.filter((r) => r.status === "merged");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">בקשות שינוי ותיקונים</h2>
        <span className="chip bg-gold-soft text-[#7a5b00]">{pending.length} ממתינות</span>
        <span className="chip bg-blue-soft text-blue-deep">{published.length} מפורסמים</span>
      </div>

      <PendingFixesSection />

      <section>
        <h3 className="mb-2 font-bold">תיקונים מפורסמים</h3>
        <p className="mb-2 text-xs text-muted">
          אחרי שהתיקון נבדק ושולב בקובץ המקורי עצמו – לחצי &quot;שולב בקובץ המקורי&quot;: הוא ייעלם מהכרטיסייה, וכשאין עוד
          תיקונים פעילים נשארת רק השורה &quot;לעריכת שינויים בקובץ&quot;.
        </p>
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
                    <span className="rounded bg-[#e9d08a] px-1">{r.originalText}</span>
                    <span className="mx-2 text-muted">←</span>
                    <span className="rounded bg-[#9ac7bc] px-1">{r.correctedText}</span>
                  </div>
                </div>
                <UnpublishFixButton id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {merged.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer font-bold">שולבו בקובץ המקורי ({merged.length})</summary>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            {merged.map((r) => (
              <li key={r.id}>
                {r.materialTitle}: {r.originalText} ← {r.correctedText}
              </li>
            ))}
          </ul>
        </details>
      )}

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
