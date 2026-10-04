import { db } from "@/db";
import { agentEvents } from "@/db/schema";

/**
 * יומן פעולות הסוכן האוטומטי (טבלת agent_events, מוצג ב-/admin/agent). בלי "server-only"
 * בכוונה — נקרא גם מסקריפטי ה-CLI (tsx) שהסוכן מריץ ב-GitHub Actions, וגם מהאתר.
 * לעולם לא זורק: כשל ברישום לא יפיל פעולה אמיתית (כמו logAudit).
 */

export type AgentEventSource = "workflow" | "claude" | "script" | "admin" | "site";

export type AgentEventInput = {
  source: AgentEventSource;
  kind: string;
  summary: string;
  details?: unknown;
  reportId?: string | null;
  actorId?: number | null;
  runId?: string | null;
};

const MAX_SUMMARY = 500;
const MAX_DETAILS = 6000;

/** מסתיר סודות נפוצים (connection strings, טוקנים, ערכי env רגישים) לפני כתיבה ליומן. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const name of ["DATABASE_URL", "DRIVE_BRIDGE_SECRET", "DRIVE_BRIDGE_URL", "CLAUDE_CODE_OAUTH_TOKEN", "GITHUB_TOKEN", "GH_DISPATCH_TOKEN", "ORACLE_CONVERT_API_KEY"]) {
    const v = process.env[name]?.trim();
    if (v && v.length >= 8) out = out.split(v).join(`[${name}]`);
  }
  return out
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgres://[REDACTED]")
    .replace(/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{16,}/g, "[GITHUB_TOKEN]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}/g, "[API_KEY]")
    .replace(/(secret|token|password|api[_-]?key)(["']?\s*[:=]\s*["']?)[^\s"',}]{6,}/gi, "$1$2[REDACTED]");
}

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + `… [נחתך, ${s.length} תווים]` : s;
}

export function currentRunId(): string {
  return process.env.AGENT_RUN_ID || process.env.GITHUB_RUN_ID || "local";
}

export async function logAgentEvent(input: AgentEventInput): Promise<void> {
  try {
    const details =
      input.details === undefined
        ? null
        : clip(redactSecrets(typeof input.details === "string" ? input.details : JSON.stringify(input.details, null, 2)), MAX_DETAILS);
    await db.insert(agentEvents).values({
      runId: input.runId ?? (input.source === "site" || input.source === "admin" ? input.source : currentRunId()),
      source: input.source.slice(0, 20),
      kind: String(input.kind).slice(0, 30),
      summary: clip(redactSecrets(input.summary), MAX_SUMMARY),
      details,
      reportId: input.reportId ?? null,
      actorId: input.actorId ?? null,
    });
  } catch (e) {
    console.error("[agentEvents] failed", e instanceof Error ? e.message : e);
  }
}
