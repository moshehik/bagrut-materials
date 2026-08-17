import Link from "next/link";
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { type SP, sp1, spInt, parseDate, fmtDateTime, qs, actionTone } from "@/lib/admin-analytics";
import { Pagination, Th, Td, EmptyRow } from "@/components/admin/analytics-ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function prettyDetails(s: string | null): { short: string; full: string; isJson: boolean } {
  if (!s) return { short: "", full: "", isJson: false };
  try {
    const obj = JSON.parse(s);
    const full = JSON.stringify(obj, null, 2);
    const short = JSON.stringify(obj);
    return { short: short.length > 80 ? short.slice(0, 80) + "…" : short, full, isJson: true };
  } catch {
    return { short: s.length > 80 ? s.slice(0, 80) + "…" : s, full: s, isJson: false };
  }
}

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actionQ = sp1(sp, "action").trim();
  const actorQ = sp1(sp, "actor").trim();
  const entityQ = sp1(sp, "entity").trim();
  const fromQ = sp1(sp, "from");
  const toQ = sp1(sp, "to");
  const page = Math.max(1, spInt(sp, "page", 1));
  const params = { action: actionQ, actor: actorQ, entity: entityQ, from: fromQ, to: toQ };

  const conds: SQL[] = [];
  if (actionQ) conds.push(ilike(auditLogs.action, `%${actionQ}%`));
  if (/^\d+$/.test(actorQ)) conds.push(eq(auditLogs.actorId, Number(actorQ)));
  else if (actorQ) conds.push(or(ilike(users.email, `%${actorQ}%`), ilike(users.name, `%${actorQ}%`))!);
  if (entityQ) {
    const m = entityQ.match(/^([a-z_]+)[:#\s]+(\d+)$/i);
    if (m) conds.push(and(eq(auditLogs.entityType, m[1]), eq(auditLogs.entityId, Number(m[2])))!);
    else if (/^\d+$/.test(entityQ)) conds.push(eq(auditLogs.entityId, Number(entityQ)));
    else conds.push(ilike(auditLogs.entityType, `%${entityQ}%`));
  }
  const from = parseDate(fromQ);
  const to = parseDate(toQ, true);
  if (from) conds.push(gte(auditLogs.createdAt, from));
  if (to) conds.push(lte(auditLogs.createdAt, to));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [totalRow], actions] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        ip: auditLogs.ip,
        actorId: auditLogs.actorId,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(auditLogs).leftJoin(users, eq(auditLogs.actorId, users.id)).where(where),
    db.select({ action: auditLogs.action, n: count() }).from(auditLogs).groupBy(auditLogs.action).orderBy(desc(count())).limit(30),
  ]);
  const total = Number(totalRow?.n ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">לוג פעולות</h2>
        <span className="chip bg-oak-soft text-oak-deep">{total.toLocaleString("he-IL")} רשומות</span>
        <a href={`/admin/logs/export${qs(params)}`} className="btn btn-ghost !py-1.5 !px-3 text-xs ms-auto">
          ייצוא CSV
        </a>
      </div>

      <form className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end text-sm" method="get">
        <label className="grid gap-1">
          <span className="text-xs text-muted">פעולה</span>
          <input name="action" defaultValue={actionQ} className="input !py-1.5" placeholder="login / material.update" list="actions" dir="ltr" />
          <datalist id="actions">
            {actions.map((a) => (
              <option key={a.action} value={a.action} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">מבצעת (מזהה / מייל / שם)</span>
          <input name="actor" defaultValue={actorQ} className="input !py-1.5" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">ישות (סוג / מזהה / material:12)</span>
          <input name="entity" defaultValue={entityQ} className="input !py-1.5" dir="ltr" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">מתאריך</span>
          <input type="date" name="from" defaultValue={fromQ} className="input !py-1.5" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">עד תאריך</span>
          <input type="date" name="to" defaultValue={toQ} className="input !py-1.5" />
        </label>
        <div className="flex gap-2">
          <button className="btn btn-oak !py-1.5 !px-4 text-sm">סינון</button>
          <Link href="/admin/logs" className="btn btn-ghost !py-1.5 !px-3 text-sm">
            איפוס
          </Link>
        </div>
      </form>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {actions.slice(0, 16).map((a) => (
            <Link
              key={a.action}
              href={qs(params, { action: a.action, page: undefined })}
              className={`chip ${actionTone(a.action)} hover:opacity-80`}
              dir="ltr"
            >
              {a.action} <span className="opacity-60">{Number(a.n)}</span>
            </Link>
          ))}
        </div>
      )}

      <section className="card p-3 sm:p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-right">
            <tr>
              <Th>זמן</Th>
              <Th>מבצעת</Th>
              <Th>פעולה</Th>
              <Th>ישות</Th>
              <Th>פרטים</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow cols={6} text="אין רשומות תואמות." />
            ) : (
              rows.map((r) => {
                const d = prettyDetails(r.details);
                return (
                  <tr key={r.id} className="border-t border-foreground/5">
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                    <Td>
                      {r.actorId ? (
                        <>
                          <Link href={qs(params, { actor: r.actorId, page: undefined })} className="font-semibold hover:underline">
                            {r.actorName ?? `#${r.actorId}`}
                          </Link>
                          {r.actorEmail && (
                            <div className="text-xs text-muted" dir="ltr">
                              {r.actorEmail}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted text-xs">מערכת</span>
                      )}
                    </Td>
                    <Td>
                      <span className={`chip ${actionTone(r.action)}`} dir="ltr">
                        {r.action}
                      </span>
                    </Td>
                    <Td className="text-xs whitespace-nowrap" dir="ltr">
                      {r.entityType ? (
                        <Link href={qs(params, { entity: `${r.entityType}:${r.entityId ?? ""}`, page: undefined })} className="hover:underline">
                          {r.entityType}
                          {r.entityId !== null && <span className="text-muted"> #{r.entityId}</span>}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="max-w-[360px]">
                      {d.full ? (
                        <details className="group">
                          <summary className="cursor-pointer text-xs font-mono text-foreground/70 truncate list-none" dir="ltr">
                            {d.short}
                          </summary>
                          <pre className="mt-1 text-xs bg-foreground/5 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all" dir="ltr">
                            {d.full}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="font-mono text-xs" dir="ltr">
                      {r.ip ?? "—"}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="mt-4">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={params} />
        </div>
      </section>
    </div>
  );
}
