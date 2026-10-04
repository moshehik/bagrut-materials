import { desc, ilike, or, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { emailLogs, users } from "@/db/schema";
import { BroadcastForm, EmailList, ManualMailForm } from "@/components/admin/mail-forms";
import { Mail, ScrollText, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE = 50;
const KIND_LABEL: Record<string, string> = {
  welcome: "ברוכה הבאה",
  purchase: "אישור רכישה",
  sell_offer: "הצעת מכירה",
  forum_reply: "תגובה בפורום",
  forum_report: "דיווח בפורום",
  contact: "צור קשר",
  manual: "ידני",
  broadcast: "דיוור",
};

export default async function AdminMailPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const configured = !!process.env.MAIL_SCRIPT_URL;

  const where = q
    ? or(ilike(emailLogs.to, `%${q}%`), ilike(emailLogs.subject, `%${q}%`), ilike(emailLogs.body, `%${q}%`))
    : undefined;

  const [logs, [{ total }], userRows, stats] = await Promise.all([
    db.select().from(emailLogs).where(where).orderBy(desc(emailLogs.sentAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(emailLogs).where(where),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(users.name),
    db
      .select({
        status: emailLogs.status,
        n: count(),
      })
      .from(emailLogs)
      .where(sql`${emailLogs.sentAt} > now() - interval '30 days'`)
      .groupBy(emailLogs.status),
  ]);
  const okCount = stats.find((s) => s.status === "success")?.n ?? 0;
  const errCount = stats.find((s) => s.status === "error")?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">מערכת המייל</h2>
        <span className="chip bg-green-100 text-green-800">30 יום: {okCount} נשלחו</span>
        {errCount > 0 && <span className="chip bg-red-100 text-red-700">{errCount} נכשלו</span>}
      </div>

      {!configured && (
        <div className="card p-4 border-amber-300 bg-amber-50 flex gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" aria-hidden />
          <div>
            <b>שרת המייל עדיין לא מוגדר.</b> יש לפרוס את הסקריפט מהקובץ{" "}
            <code className="font-mono">docs/google-apps-script.gs</code> ב-Google Apps Script (חשבון ה-Gmail
            שממנו נשלחים המיילים) ולהגדיר את הכתובת במשתנה הסביבה <code className="font-mono">MAIL_SCRIPT_URL</code> ב-Vercel.
            עד אז כל שליחה תירשם בלוג כשגיאה.
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="flex items-center gap-2 font-bold text-lg mb-3">
            <Mail className="h-5 w-5 text-blue" aria-hidden /> שליחת מייל
          </h3>
          <ManualMailForm defaultTo={sp.to ?? ""} />
        </section>
        <section className="card p-5">
          <h3 className="flex items-center gap-2 font-bold text-lg mb-3">
            <Mail className="h-5 w-5 text-gold" aria-hidden /> דיוור לקבוצה
          </h3>
          <BroadcastForm />
        </section>
      </div>

      <section className="card p-5">
        <h3 className="font-bold text-lg mb-3">רשימת המיילים של המשתמשות ({userRows.length})</h3>
        <EmailList rows={userRows} />
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h3 className="flex items-center gap-2 font-bold text-lg">
            <ScrollText className="h-5 w-5 text-oak" aria-hidden /> לוג שליחות
          </h3>
          <span className="chip bg-blue-soft text-blue-deep">{total}</span>
          <form className="ms-auto flex gap-2">
            <input name="q" defaultValue={q} placeholder="חיפוש בנמען / נושא / תוכן" className="input py-1.5 max-w-xs" />
            <button className="btn btn-ghost text-sm py-1.5">חיפוש</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          {logs.length === 0 ? (
            <p className="text-sm text-muted">אין רשומות.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted text-right">
                <tr>
                  <th className="py-2 pe-3 font-medium">תאריך</th>
                  <th className="py-2 pe-3 font-medium">אל</th>
                  <th className="py-2 pe-3 font-medium">נושא</th>
                  <th className="py-2 pe-3 font-medium">סוג</th>
                  <th className="py-2 pe-3 font-medium">קובץ</th>
                  <th className="py-2 pe-3 font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-foreground/5 align-top">
                    <td className="py-2 pe-3 whitespace-nowrap text-muted">
                      {l.sentAt.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="py-2 pe-3" dir="ltr">
                      {l.to}
                      {l.cc && <div className="text-xs text-muted">cc: {l.cc}</div>}
                    </td>
                    <td className="py-2 pe-3 max-w-xs">
                      <div className="font-semibold">{l.subject}</div>
                      {l.body && <div className="text-xs text-muted line-clamp-2 whitespace-pre-wrap">{l.body}</div>}
                    </td>
                    <td className="py-2 pe-3">
                      <span className="chip bg-oak-soft text-oak-deep">{KIND_LABEL[l.kind] ?? l.kind}</span>
                    </td>
                    <td className="py-2 pe-3 text-xs" dir="ltr">{l.fileName ?? "—"}</td>
                    <td className="py-2 pe-3">
                      {l.status === "success" ? (
                        <span className="chip bg-green-100 text-green-800">נשלח</span>
                      ) : (
                        <span className="chip bg-red-100 text-red-700" title={l.errorMessage ?? ""}>
                          שגיאה
                        </span>
                      )}
                      {l.status !== "success" && l.errorMessage && (
                        <div className="text-[11px] text-red-600 max-w-[200px] break-words">{l.errorMessage}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 mt-3 text-sm">
            {page > 1 && (
              <Link className="btn btn-ghost py-1" href={`/admin/mail?q=${encodeURIComponent(q)}&page=${page - 1}`}>
                הקודם
              </Link>
            )}
            <span className="text-muted">
              עמוד {page} מתוך {totalPages}
            </span>
            {page < totalPages && (
              <Link className="btn btn-ghost py-1" href={`/admin/mail?q=${encodeURIComponent(q)}&page=${page + 1}`}>
                הבא
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
