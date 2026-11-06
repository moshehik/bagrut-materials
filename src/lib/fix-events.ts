/**
 * יומן של כל מה שקורה להערה/בקשת תיקון (material_fixes) – "לא מוחקים, שומרים הכול, מתעדים הכול" (משה, 2026-11-06).
 * כל אירוע נכתב פעמיים: ל-audit_logs (entityType "material_fix", entityId = fixId – מזה נבנה ציר הזמן ב-/admin/fixes)
 * ול-agent_events (יומן הסוכן ב-/admin/agent). בלי "server-only" בכוונה – נקרא גם מסקריפטי tsx; לכן לא משתמשים
 * ב-logAudit (שמייבא next/headers) אלא כותבים ל-audit_logs ישירות, עם ip שהקורא מעביר אם יש.
 * לעולם לא זורק.
 */
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { logAgentEvent, redactSecrets, type AgentEventSource } from "@/lib/agentEvents";

export const FIX_ENTITY = "material_fix";

export type FixEventInput = {
  fixId: number;
  materialId?: number | null;
  /** למשל fix.general.received / fix.general.get / fix.general.check / fix.general.private / fix.general.merge / ... */
  action: string;
  /** מי: מורה (actorId) / המנהלת / הסוכן (null) */
  actorId?: number | null;
  source?: AgentEventSource;
  summary: string;
  details?: Record<string, unknown>;
  ip?: string | null;
};

export async function logFixEvent(e: FixEventInput): Promise<void> {
  const details = { materialId: e.materialId ?? null, ...(e.details ?? {}) };
  try {
    await db.insert(auditLogs).values({
      actorId: e.actorId ?? null,
      action: e.action.slice(0, 60),
      entityType: FIX_ENTITY,
      entityId: e.fixId,
      details: redactSecrets(JSON.stringify({ summary: e.summary, ...details })),
      ip: e.ip ?? null,
    });
  } catch (err) {
    console.error("[fix-events] audit insert failed", err instanceof Error ? err.message : err);
  }
  await logAgentEvent({
    source: e.source ?? "claude",
    kind: "fix",
    summary: `[הערה #${e.fixId}${e.materialId ? ` / חומר #${e.materialId}` : ""}] ${e.summary}`,
    details: { action: e.action, fixId: e.fixId, ...details },
    actorId: e.actorId ?? null,
  });
}

export type FixTimelineEntry = { id: number; fixId: number; action: string; actorId: number | null; summary: string; details: Record<string, unknown>; createdAt: Date };

/** ציר הזמן של הערות (לפי audit_logs) – למנהלת. שגיאת DB = מפה ריקה. */
export async function listFixTimeline(fixIds: number[], limitPerFix = 50): Promise<Map<number, FixTimelineEntry[]>> {
  const out = new Map<number, FixTimelineEntry[]>();
  if (fixIds.length === 0) return out;
  try {
    const rows = await db
      .select()
      .from(auditLogs)
      .where(inArray(auditLogs.entityId, fixIds))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limitPerFix * fixIds.length);
    for (const r of rows) {
      if (r.entityType !== FIX_ENTITY || r.entityId == null) continue;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = r.details ? (JSON.parse(r.details) as Record<string, unknown>) : {};
      } catch {
        parsed = { raw: r.details };
      }
      const { summary, ...details } = parsed;
      const list = out.get(r.entityId) ?? [];
      if (list.length >= limitPerFix) continue;
      list.push({ id: r.id, fixId: r.entityId, action: r.action, actorId: r.actorId, summary: typeof summary === "string" ? summary : r.action, details, createdAt: r.createdAt });
      out.set(r.entityId, list);
    }
    for (const list of out.values()) list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  } catch (e) {
    console.error("listFixTimeline failed", e);
  }
  return out;
}

/** ציר הזמן של הערה אחת */
export async function fixTimeline(fixId: number): Promise<FixTimelineEntry[]> {
  return (await listFixTimeline([fixId])).get(fixId) ?? [];
}
