import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

/** IP + user-agent של הבקשה הנוכחית (עובד ב-server actions וב-route handlers) */
export async function requestMeta() {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null;
    return { ip, userAgent: h.get("user-agent") ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export type AuditInput = {
  actorId?: number | null;
  action: string; // למשל: material.create, user.suspend, settings.update, purchase.refund, login, login.google
  entityType?: string;
  entityId?: number | null;
  details?: unknown;
};

/** רישום פעולה בלוג הפעולות. לעולם לא זורק. */
export async function logAudit(input: AuditInput) {
  try {
    const { ip } = await requestMeta();
    await db.insert(auditLogs).values({
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      details:
        input.details === undefined
          ? null
          : typeof input.details === "string"
            ? input.details
            : JSON.stringify(input.details),
      ip,
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
