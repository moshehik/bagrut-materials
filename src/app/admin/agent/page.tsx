import Link from "next/link";
import { and, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agentEvents, users } from "@/db/schema";
import { type SP, sp1, spInt, parseDate, fmtDateTime, qs } from "@/lib/admin-analytics";
import { Pagination, Th, Td, EmptyRow, StatTile } from "@/components/admin/analytics-ui";
import { isLoopEnabled, idleMinutes } from "@/lib/agentLoopStatus";
import { AgentToggle } from "@/components/admin/agent-toggle";
import { AgentSystemPanel } from "@/components/admin/agent-system-panel";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const SOURCE_LABEL: Record<string, string> = {
  workflow: "workflow",
  claude: "קלוד",
  script: "סקריפט",
  admin: "מנהלת",
  site: "האתר",
};

function kindTone(kind: string): string {
  if (kind === "error" || kind.endsWith(".fail")) return "bg-red-50 text-red-700";
  if (kind.startsWith("run.")) return "bg-blue-soft text-blue-deep";
  if (kind === "toggle" || kind === "dispatch") return "bg-violet-50 text-violet-700";
  if (kind === "tool" || kind === "tool.result" || kind === "cli") return "bg-oak-soft text-oak-deep";
  if (kind === "pr" || kind === "commit" || kind === "fix") return "bg-emerald-50 text-emerald-700";
  if (kind === "reply" || kind.startsWith("report.")) return "bg-gold-soft text-gold";
  return "bg-foreground/5 text-foreground/70";
}

export default async function AdminAgentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const kindQ = sp1(sp, "kind").trim();
  const sourceQ = sp1(sp, "source").trim();
  const runQ = sp1(sp, "run").trim();
  const textQ = sp1(sp, "q").trim();
  const fromQ = sp1(sp, "from");
  const toQ = sp1(sp, "to");
  const page = Math.max(1, spInt(sp, "page", 1));
  const params = { kind: kindQ, source: sourceQ, run: runQ, q: textQ, from: fromQ, to: toQ };

  const conds: SQL[] = [];
  if (kindQ) conds.push(ilike(agentEvents.kind, `%${kindQ}%`));
  if (sourceQ) conds.push(eq(agentEvents.source, sourceQ));
  if (runQ) conds.push(eq(agentEvents.runId, runQ));
  if (textQ) conds.push(or(ilike(agentEvents.summary, `%${textQ}%`), ilike(agentEvents.details, `%${textQ}%`))!);
  const from = parseDate(fromQ);
  const to = parseDate(toQ, true);
  if (from) conds.push(gte(agentEvents.createdAt, from));
  if (to) conds.push(lte(agentEvents.createdAt, to));
  const where = conds.length ? and(...conds) : undefined;

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);

  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };

  const [enabled, idle, rows, [totalRow], kinds, [stats24], lastRun] = await Promise.all([
    safe(isLoopEnabled(), false),
    safe(idleMinutes(), -1),
    safe(
      db
        .select({
          id: agentEvents.id,
          createdAt: agentEvents.createdAt,
          runId: agentEvents.runId,
          source: agentEvents.source,
          kind: agentEvents.kind,
          summary: agentEvents.summary,
          details: agentEvents.details,
          reportId: agentEvents.reportId,
          actorName: users.name,
        })
        .from(agentEvents)
        .leftJoin(users, eq(agentEvents.actorId, users.id))
        .where(where)
        .orderBy(desc(agentEvents.createdAt), desc(agentEvents.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      [],
    ),
    safe(db.select({ n: count() }).from(agentEvents).where(where), [{ n: 0 }]),
    safe(db.select({ kind: agentEvents.kind, n: count() }).from(agentEvents).groupBy(agentEvents.kind).orderBy(desc(count())).limit(24), []),
    safe(
      db
        .select({
          events: count(),
          runs: sql<number>`count(distinct ${agentEvents.runId}) filter (where ${agentEvents.kind} = 'run.start')`,
          errors: sql<number>`count(*) filter (where ${agentEvents.kind} = 'error' or ${agentEvents.kind} like '%.fail')`,
          tools: sql<number>`count(*) filter (where ${agentEvents.kind} = 'tool')`,
        })
        .from(agentEvents)
        .where(gte(agentEvents.createdAt, dayAgo)),
      [{ events: 0, runs: 0, errors: 0, tools: 0 }],
    ),
    safe(
      db
        .select({ createdAt: agentEvents.createdAt, kind: agentEvents.kind, summary: agentEvents.summary })
        .from(agentEvents)
        .where(or(eq(agentEvents.kind, "run.start"), eq(agentEvents.kind, "run.skip")))
        .orderBy(desc(agentEvents.createdAt))
        .limit(1),
      [],
    ),
  ]);
  const total = Number(totalRow?.n ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">סוכן קלוד — הפעלה ויומן</h2>
        <Link href="/agent-system" className="btn btn-ghost !py-1.5 !px-3 text-xs ms-auto">
          תיעוד המערכת
        </Link>
      </div>

      <AgentToggle initialEnabled={enabled} idleMinutes={idle} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label="הרצות ב-24 שעות" value={Number(stats24?.runs ?? 0)} tone="bg-blue-soft text-blue-deep" />
        <StatTile label="קריאות כלי ב-24 שעות" value={Number(stats24?.tools ?? 0)} tone="bg-oak-soft text-oak-deep" />
        <StatTile label="אירועים ביומן (24 שעות)" value={Number(stats24?.events ?? 0)} tone="bg-gold-soft text-gold" />
        <StatTile
          label="שגיאות ב-24 שעות"
          value={Number(stats24?.errors ?? 0)}
          tone={Number(stats24?.errors ?? 0) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}
          hint={lastRun[0] ? `בדיקה אחרונה: ${fmtDateTime(lastRun[0].createdAt)}` : "אין עדיין בדיקות"}
        />
      </div>

      <section className="space-y-4" aria-labelledby="log-h">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id="log-h" className="font-display text-xl font-bold">
            יומן מלא של פעולות הסוכן
          </h3>
          <span className="chip bg-oak-soft text-oak-deep">{total.toLocaleString("he-IL")} רשומות</span>
          <a href={`/admin/agent/export${qs(params)}`} className="btn btn-ghost !py-1.5 !px-3 text-xs ms-auto">
            ייצוא CSV
          </a>
        </div>

        <form className="card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end text-sm" method="get">
          <label className="grid gap-1">
            <span className="text-xs text-muted">סוג</span>
            <input name="kind" defaultValue={kindQ} className="input !py-1.5" dir="ltr" list="agent-kinds" placeholder="tool / message / error" />
            <datalist id="agent-kinds">
              {kinds.map((k) => (
                <option key={k.kind} value={k.kind} />
              ))}
            </datalist>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">מקור</span>
            <select name="source" defaultValue={sourceQ} className="input !py-1.5">
              <option value="">הכל</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">מזהה הרצה</span>
            <input name="run" defaultValue={runQ} className="input !py-1.5" dir="ltr" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">חיפוש חופשי</span>
            <input name="q" defaultValue={textQ} className="input !py-1.5" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">מתאריך</span>
            <input type="date" name="from" defaultValue={fromQ} className="input !py-1.5" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">עד תאריך</span>
            <input type="date" name="to" defaultValue={toQ} className="input !py-1.5" />
          </label>
          <div className="flex gap-2 lg:col-span-6">
            <button className="btn btn-oak !py-1.5 !px-4 text-sm">סינון</button>
            <Link href="/admin/agent" className="btn btn-ghost !py-1.5 !px-3 text-sm">
              איפוס
            </Link>
          </div>
        </form>

        {kinds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {kinds.slice(0, 14).map((k) => (
              <Link key={k.kind} href={qs(params, { kind: k.kind, page: undefined })} className={`chip ${kindTone(k.kind)} hover:opacity-80`} dir="ltr">
                {k.kind} <span className="opacity-60">{Number(k.n)}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="card p-3 sm:p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted text-right">
              <tr>
                <Th>זמן</Th>
                <Th>מקור</Th>
                <Th>סוג</Th>
                <Th>תקציר</Th>
                <Th>הרצה</Th>
                <Th>דיווח</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow cols={6} text="אין עדיין אירועים. כל פעולה של הסוכן תופיע כאן." />
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-foreground/5">
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                    <Td className="text-xs whitespace-nowrap">
                      {SOURCE_LABEL[r.source] ?? r.source}
                      {r.actorName && <div className="text-muted">{r.actorName}</div>}
                    </Td>
                    <Td>
                      <span className={`chip ${kindTone(r.kind)}`} dir="ltr">
                        {r.kind}
                      </span>
                    </Td>
                    <Td className="max-w-[520px]">
                      {r.details ? (
                        <details>
                          <summary className="cursor-pointer text-sm">{r.summary}</summary>
                          <pre className="mt-1 text-xs bg-foreground/5 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all" dir="auto">
                            {r.details}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-sm">{r.summary}</span>
                      )}
                    </Td>
                    <Td className="font-mono text-xs" dir="ltr">
                      {r.runId ? (
                        <Link href={qs(params, { run: r.runId, page: undefined })} className="hover:underline">
                          {r.runId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="font-mono text-xs" dir="ltr">
                      {r.reportId ? (
                        <Link href={qs(params, { q: r.reportId.slice(0, 8), page: undefined })} className="hover:underline">
                          {r.reportId.slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={params} />
      </section>

      <section className="card p-6" aria-labelledby="tools-h">
        <h3 id="tools-h" className="font-display text-xl font-bold mb-4">
          דיווחים, בדיקות וחיפוש בדרייב
        </h3>
        <AgentSystemPanel />
      </section>
    </div>
  );
}
