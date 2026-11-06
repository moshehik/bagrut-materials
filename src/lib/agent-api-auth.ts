/**
 * אימות ה-API של הסוכן (/api/agent/*): טוקן אחד ייעודי, AGENT_API_TOKEN, שמוגדר ב-Vercel (env של האתר) וכ-secret
 * ב-GitHub Actions (ר' .github/workflows/claude-fix-reports.yml). לא משתמשים בסוד אחר (SESSION_SECRET / DRIVE_BRIDGE_SECRET)
 * – לכל סוד תפקיד אחד. ההשוואה באורך קבוע (SHA-256 + timingSafeEqual, כמו /api/pay/callback). טהור – נבדק ב-
 * scripts/agent-api-auth.test.ts.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const AGENT_TOKEN_MIN_LENGTH = 32;

/** הטוקן מהכותרת Authorization: Bearer <token> (או null) */
export function bearerFrom(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  return m ? m[1] : null;
}

/** true רק כשהסוד מוגדר, ארוך מספיק, והטוקן שהתקבל זהה לו (השוואה באורך קבוע) */
export function verifyAgentToken(presented: string | null | undefined, expected: string | null | undefined): boolean {
  const exp = (expected ?? "").trim();
  const got = (presented ?? "").trim();
  if (exp.length < AGENT_TOKEN_MIN_LENGTH || !got) return false;
  const a = createHash("sha256").update(exp).digest();
  const b = createHash("sha256").update(got).digest();
  return timingSafeEqual(a, b);
}

export type AgentAuthResult = { ok: true } | { ok: false; status: 401 | 403 | 503; error: string };

/** מכריע בקשה: 503 כשהטוקן לא מוגדר בשרת (הפיצ'ר כבוי), 401 בלי טוקן, 403 טוקן שגוי */
export function authorizeAgentRequest(authorizationHeader: string | null | undefined, expected = process.env.AGENT_API_TOKEN): AgentAuthResult {
  if (!expected || expected.trim().length < AGENT_TOKEN_MIN_LENGTH) return { ok: false, status: 503, error: "AGENT_API_TOKEN לא מוגדר בשרת (או קצר מ-32 תווים)" };
  const token = bearerFrom(authorizationHeader);
  if (!token) return { ok: false, status: 401, error: "חסר Authorization: Bearer <AGENT_API_TOKEN>" };
  if (!verifyAgentToken(token, expected)) return { ok: false, status: 403, error: "טוקן שגוי" };
  return { ok: true };
}
