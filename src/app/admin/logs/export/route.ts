import { type NextRequest } from "next/server";
import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { parseDate, toCsv, csvResponse } from "@/lib/admin-analytics";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("forbidden", { status: 403 });

  const q = req.nextUrl.searchParams;
  const actionQ = (q.get("action") ?? "").trim();
  const actorQ = (q.get("actor") ?? "").trim();
  const entityQ = (q.get("entity") ?? "").trim();
  const from = parseDate(q.get("from") ?? "");
  const to = parseDate(q.get("to") ?? "", true);

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
  if (from) conds.push(gte(auditLogs.createdAt, from));
  if (to) conds.push(lte(auditLogs.createdAt, to));

  const rows = await db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      actorId: auditLogs.actorId,
      actorName: users.name,
      actorEmail: users.email,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      details: auditLogs.details,
      ip: auditLogs.ip,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(50000);

  const csv = toCsv(
    ["מזהה", "זמן", "מזהה מבצעת", "שם", "מייל", "פעולה", "סוג ישות", "מזהה ישות", "פרטים", "IP"],
    rows.map((r) => [
      r.id,
      r.createdAt.toISOString(),
      r.actorId,
      r.actorName,
      r.actorEmail,
      r.action,
      r.entityType,
      r.entityId,
      r.details,
      r.ip,
    ]),
  );
  // רישום ייצוא יומן הפעולות עצמו (נרשם אחרי השליפה, כך שהשורה לא נכללת בקובץ)
  await logAudit({
    actorId: user.id,
    action: "logs.export",
    entityType: "audit_log",
    details: {
      rows: rows.length,
      filters: { action: actionQ || null, actor: actorQ || null, entity: entityQ || null, from: q.get("from") || null, to: q.get("to") || null },
    },
  });
  return csvResponse(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
