import { type NextRequest } from "next/server";
import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agentEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { parseDate, toCsv, csvResponse } from "@/lib/admin-analytics";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("forbidden", { status: 403 });

  const q = req.nextUrl.searchParams;
  const kindQ = (q.get("kind") ?? "").trim();
  const sourceQ = (q.get("source") ?? "").trim();
  const runQ = (q.get("run") ?? "").trim();
  const textQ = (q.get("q") ?? "").trim();
  const from = parseDate(q.get("from") ?? "");
  const to = parseDate(q.get("to") ?? "", true);

  const conds: SQL[] = [];
  if (kindQ) conds.push(ilike(agentEvents.kind, `%${kindQ}%`));
  if (sourceQ) conds.push(eq(agentEvents.source, sourceQ));
  if (runQ) conds.push(eq(agentEvents.runId, runQ));
  if (textQ) conds.push(or(ilike(agentEvents.summary, `%${textQ}%`), ilike(agentEvents.details, `%${textQ}%`))!);
  if (from) conds.push(gte(agentEvents.createdAt, from));
  if (to) conds.push(lte(agentEvents.createdAt, to));

  const rows = await db
    .select()
    .from(agentEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(agentEvents.createdAt))
    .limit(50000);

  const csv = toCsv(
    ["מזהה", "זמן", "הרצה", "מקור", "סוג", "תקציר", "פרטים", "דיווח"],
    rows.map((r) => [r.id, r.createdAt.toISOString(), r.runId, r.source, r.kind, r.summary, r.details, r.reportId]),
  );
  await logAudit({
    actorId: user.id,
    action: "agent.export",
    entityType: "agent",
    details: { rows: rows.length, filters: { kind: kindQ || null, source: sourceQ || null, run: runQ || null, q: textQ || null } },
  });
  return csvResponse(`agent-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
