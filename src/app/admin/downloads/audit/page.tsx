import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { runDownloadAudit, viaHe, type AuditFinding } from "@/lib/download-audit";
import { type SP, sp1, parseDate, fmtDateTime } from "@/lib/admin-analytics";
import { StatTile, Th, Td, EmptyRow } from "@/components/admin/analytics-ui";
import { DT } from "@/components/admin/date-tip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function FindingsTable({ rows, empty }: { rows: AuditFinding[]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted text-right">
          <tr>
            <Th>זמן</Th>
            <Th>משתמשת</Th>
            <Th>חומר</Th>
            <Th>איך הותרה ההורדה</Th>
            <Th>הבעיה</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow cols={5} text={empty} />
          ) : (
            rows.map((r) => (
              <tr key={r.downloadId} className="border-t border-foreground/5 align-top">
                <Td className="whitespace-nowrap text-xs"><DT value={r.at} time /></Td>
                <Td>
                  <Link href={`/admin/downloads?user=${r.userId}`} className="font-semibold hover:underline">
                    {r.userLabel}
                  </Link>
                </Td>
                <Td className="max-w-[260px]">
                  <Link href={`/admin/downloads?material=${r.materialId}`} className="text-blue-deep hover:underline">
                    {r.materialTitle}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">
                  {r.via.startsWith("view:") ? "צפייה מלאה · " : ""}
                  {viaHe(r.via.replace(/^view:/, ""))}
                </Td>
                <Td>
                  <div className="font-medium">{r.reason}</div>
                  {r.detail && <div className="text-xs text-muted">{r.detail}</div>}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function DownloadAuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const fromQ = sp1(sp, "from");
  const toQ = sp1(sp, "to");
  const run = sp1(sp, "run") === "1";

  let result: Awaited<ReturnType<typeof runDownloadAudit>> | null = null;
  let error: string | null = null;
  if (run) {
    try {
      result = await runDownloadAudit({ from: parseDate(fromQ), to: parseDate(toQ, true) });
    } catch (e) {
      console.error("download audit failed", e);
      error = "הבדיקה נכשלה (שגיאת מסד נתונים), נסי שוב בעוד רגע.";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">בדיקת הרשאות הורדה</h2>
        <Link href="/admin/downloads" className="btn btn-ghost !py-1.5 !px-3 text-xs ms-auto">
          ← היסטוריית הורדות
        </Link>
      </div>

      <p className="text-sm text-muted max-w-3xl">
        עוברת על כל ההורדות (והצפיות המלאות) ובודקת, לפי מצב המורה ברגע ההורדה, שהייתה לה זכות להוריד: חינם, רכישה בודדת,
        קובץ מורחב, מנוי בתחום ובמכסה, או גישה בזכות שיחה. מנהלות לא נבדקות. הבדיקה בקריאה בלבד ולא משנה שום נתון.
      </p>

      <form className="card p-4 flex flex-wrap gap-3 items-end text-sm" method="get">
        <input type="hidden" name="run" value="1" />
        <label className="grid gap-1">
          <span className="text-xs text-muted">מתאריך (ריק = מההתחלה)</span>
          <input type="date" name="from" defaultValue={fromQ} className="input !py-1.5" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">עד תאריך (ריק = עד היום)</span>
          <input type="date" name="to" defaultValue={toQ} className="input !py-1.5" />
        </label>
        <button className="btn btn-oak !py-1.5 !px-5 text-sm">{result ? "הרצה מחדש" : "הרצת הבדיקה"}</button>
      </form>

      {error && (
        <div role="alert" className="card p-4 text-red-800 bg-red-50">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <StatTile label="נבדקו" value={result.checked.toLocaleString("he-IL")} />
            <StatTile
              label="הורדות ללא הרשאה"
              value={result.violations.length.toLocaleString("he-IL")}
              tone={result.violations.length ? "bg-red-100 text-red-800" : "bg-emerald-50 text-emerald-700"}
            />
            <StatTile label="אזהרות" value={result.warnings.length.toLocaleString("he-IL")} tone="bg-gold-soft text-gold" />
            <StatTile label="מנהלות (לא נבדקו)" value={result.skippedAdmin.toLocaleString("he-IL")} />
          </div>

          <div
            className={`card p-4 font-bold ${result.violations.length ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
          >
            {result.violations.length
              ? `נמצאו ${result.violations.length} הורדות ללא זכאות מתועדת – ראי למטה.`
              : "לא נמצאה אף הורדה ללא הרשאה."}
            <span className="font-normal text-xs text-muted ms-3">
              {result.firstAt ? `טווח שנבדק: ${fmtDateTime(result.firstAt)} – ${fmtDateTime(result.lastAt)} · ` : ""}
              הורצה <DT value={result.ranAt} time />
            </span>
          </div>

          <section className="card p-5">
            <h3 className="font-bold mb-3">פירוט לפי דרך ההורדה</h3>
            <table className="text-sm">
              <tbody>
                {result.byVia.map((v) => (
                  <tr key={v.via} className="border-t border-foreground/5">
                    <Td>{v.via}</Td>
                    <Td className="font-bold">{v.n.toLocaleString("he-IL")}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-3 sm:p-5">
            <h3 className="font-bold mb-3">הורדות ללא הרשאה ({result.violations.length})</h3>
            <FindingsTable rows={result.violations} empty="אין." />
          </section>

          <section className="card p-3 sm:p-5">
            <h3 className="font-bold mb-1">אזהרות ({result.warnings.length})</h3>
            <p className="text-xs text-muted mb-3">
              לא בהכרח חריגה: חוסר תיעוד (למשל מנוי שלא נרשם בשורה), רכישה שבוטלה אחרי ההורדה, או חומר ששונה מאז.
            </p>
            <FindingsTable rows={result.warnings} empty="אין." />
          </section>

          <p className="text-xs text-muted">
            מגבלות: אין היסטוריה של שינוי הגדרת &quot;חינם&quot; לחומר, ולכן הורדות &quot;חינם&quot; נבדקות לפי ההגדרה הנוכחית. אין תאריך ביטול לרכישה,
            ולכן ביטול/החזר שנעשו אחרי ההורדה מסומנים כאזהרה.
          </p>
        </>
      )}
    </div>
  );
}
