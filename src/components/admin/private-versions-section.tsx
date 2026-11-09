import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes, materials, users } from "@/db/schema";
import { listActivePrivateVersions } from "@/lib/private-versions";
import { listFixTimeline } from "@/lib/fix-events";
import { parseArtifacts } from "@/lib/general-fix";
import { RemovePrivateVersionButton } from "@/components/admin/private-version-buttons";
import { FixTimeline } from "@/components/admin/fix-timeline";
import { DT } from "@/components/admin/date-tip";

/**
 * /admin/fixes: (1) גרסאות פרטיות מתוקנות (קובץ שהסוכן ערך רק עבור מורה אחת בעקבות הערה כללית שלה) – המנהלת רואה
 * (קישור בדיקה ‎/api/preview/<id>?pv=<versionId>‎, מוגש רק למנהלת) ויכולה להסיר (סטטוס בלבד; הקובץ נשאר בדרייב);
 * (2) כל ההערות הכלליות (ממתינות/טופלו) עם ציר זמן מלא לקריאה בלבד (audit_logs) וקבצי העבודה שנשמרו – שום דבר לא נמחק.
 */
export async function PrivateVersionsSection() {
  const [versions, complaints] = await Promise.all([
    listActivePrivateVersions().catch(() => []),
    db
      .select({
        id: materialFixes.id,
        status: materialFixes.status,
        requestText: materialFixes.requestText,
        replyText: materialFixes.replyText,
        adminNote: materialFixes.adminNote,
        artifacts: materialFixes.artifacts,
        createdAt: materialFixes.createdAt,
        publishedAt: materialFixes.publishedAt,
        materialId: materialFixes.materialId,
        materialTitle: materials.title,
        userName: users.name,
      })
      .from(materialFixes)
      .innerJoin(materials, eq(materials.id, materialFixes.materialId))
      .leftJoin(users, eq(users.id, materialFixes.userId))
      .where(eq(materialFixes.kind, "general"))
      .orderBy(desc(materialFixes.createdAt))
      .limit(60)
      .catch(() => []),
  ]);
  const timelines = await listFixTimeline(complaints.map((c) => c.id));
  if (versions.length === 0 && complaints.length === 0) return null;
  const statusLabel = (s: string) =>
    s === "pending" ? "ממתינה לסוכן" : s === "private" ? "תוקן רק למבקשת" : s === "merged" ? "שולב לכולן" : s === "answered" ? "נענתה בלי שינוי" : s === "rejected" ? "נדחתה" : s === "cancelled" ? "בוטלה ע\"י המורה" : s;
  const versionsByFix = new Map<number, (typeof versions)[number]>();
  for (const v of versions) if (v.fixId) versionsByFix.set(v.fixId, v);
  return (
    <>
      {versions.length > 0 && (
        <details className="card p-4" open>
          <summary className="cursor-pointer font-bold">גרסאות פרטיות מתוקנות – קובץ שתוקן למורה אחת ({versions.length})</summary>
          <p className="mt-2 text-xs text-muted">
            בעקבות הערה כללית, הסוכן ערך את הקובץ ופרסם אותו רק למורה שביקשה: ההורדה/הצפייה/המייל שלה מקבלים את הגרסה הזו
            במקום הקובץ המשותף (עם אותה הטבעה והמרה). הקובץ המשותף לא השתנה. הסרה = היא חוזרת לקובץ המשותף; השורה מסומנת
            &quot;הוסרה&quot; והקובץ נשאר בדרייב (תת-תיקיית &quot;לא פעילות&quot;) – שום דבר לא נמחק.
          </p>
          <ul className="mt-2 divide-y divide-foreground/5 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {v.materialTitle} <span className="text-xs text-muted">· #{v.materialId} · {v.fileName}</span>
                  </div>
                  <div className="text-xs text-muted">
                    למורה: {v.userName ?? `#${v.userId}`} · <DT value={v.createdAt} /> · הערה #{v.fixId ?? "—"} · {Math.round(v.size / 1024)}KB · גרסה #{v.id}
                  </div>
                  {v.note && <div className="mt-1 whitespace-pre-wrap text-xs">{v.note}</div>}
                  <a href={`/api/preview/${v.materialId}?pv=${v.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline">
                    לצפייה בגרסה הפרטית (מנהלת)
                  </a>
                </div>
                <RemovePrivateVersionButton id={v.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {complaints.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer font-bold">הערות כלליות על קבצים – היסטוריה מלאה ({complaints.length})</summary>
          <p className="mt-2 text-xs text-muted">
            לכל הערה: מה המורה כתבה, מה הוחלט, מה נענה לה, קבצי העבודה שנשמרו בדרייב (המקור שהסוכן ראה, הקובץ הערוך, ה-PDF
            המומר, מה שפורסם) וציר הזמן המלא. לקריאה בלבד – לא נמחק כלום.
          </p>
          <ul className="mt-2 space-y-4 text-sm">
            {complaints.map((r) => {
              const arts = parseArtifacts(r.artifacts);
              const pv = versionsByFix.get(r.id);
              return (
                <li key={r.id} className="rounded-lg border border-foreground/10 p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="chip bg-blue-soft text-blue-deep">{statusLabel(r.status)}</span>
                    <b>{r.materialTitle}</b>
                    <span className="text-xs text-muted">
                      #{r.materialId} · הערה #{r.id} · {r.userName ?? "—"} · <DT value={r.createdAt} />
                      {pv ? ` · גרסה פרטית פעילה #${pv.id}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">«{r.requestText}»</p>
                  {r.replyText && <p className="mt-1 text-xs">תשובה למורה: {r.replyText}</p>}
                  {r.adminNote && <p className="text-xs text-muted">{r.adminNote}</p>}
                  {arts.length > 0 && (
                    <p className="mt-1 text-xs text-muted" dir="ltr">
                      קבצי עבודה בדרייב: {arts.map((a) => `${a.kind} (${a.driveId}, ${Math.round(a.size / 1024)}KB)`).join(" · ")}
                    </p>
                  )}
                  <FixTimeline entries={timelines.get(r.id) ?? []} />
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </>
  );
}
