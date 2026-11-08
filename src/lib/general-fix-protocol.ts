/**
 * הפרוטוקול של ה-API לסוכן (/api/agent/general-fix) – טהור (zod + מגבלות), משותף לשרת ולסקריפט
 * scripts/agent-general-fix.ts במצב API. נבדק ב-scripts/general-fix-protocol.test.ts.
 *
 * כל הקריאות: POST JSON ‎{ action, ...}‎ עם Authorization: Bearer <AGENT_API_TOKEN>, תמיד דרך הדומיין של האתר.
 * קבצים עוברים כ-base64 בתוך ה-JSON (גוף בקשה ב-Vercel מוגבל ל-~4.5MB → docx עד MAX_DOCX_BYTES; גדול יותר נדחה
 * בשגיאה ברורה – אז עובדים במצב ישיר מקומית). פעולות ההחלטה הן dry-run אלא אם apply=true.
 */
import { z } from "zod";
import { REPLY_LIBRARY_ERROR, mentionsSourceLibrary } from "@/lib/reply-text";

/** docx מקסימלי שעובר ב-JSON (base64 מנפח ב-33%, ונשאר מקום לשאר הגוף מתחת ל-4.5MB) */
export const MAX_DOCX_BYTES = 3 * 1024 * 1024;
export const MAX_BODY_BYTES = 4_400_000;

const fixId = z.coerce.number().int().positive();
const note = z.string().trim().min(3, "note קצר מדי").max(600, "note ארוך מדי (עד 600 תווים)");
/** note שהמורה רואה (private / merge / answer): בלי אזכור אתר/ספריית המקור ("ספריא" וכד') – נדחה כדי שהסוכן ינסח מחדש */
const replyNote = note.refine((t) => !mentionsSourceLibrary(t), { message: REPLY_LIBRARY_ERROR });
const docxBase64 = z.string().min(100, "docxBase64 חסר/קצר מדי").max(Math.ceil((MAX_DOCX_BYTES * 4) / 3) + 16, `הקובץ גדול מ-${Math.round(MAX_DOCX_BYTES / 1048576)}MB – ה-API לא מקבל אותו; עבדו במצב ישיר (DRIVE_BRIDGE_* + ORACLE_CONVERT_URL)`);
const apply = z.boolean().optional().default(false);

export const agentRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  // base: viewer (ברירת מחדל) = הקובץ שהמורה רואה (הגרסה הפרטית שלה / המשותף + התיקונים המסומנים שלה); shared = המשותף החי בלבד (ל-merge)
  z.object({ action: z.literal("get"), fixId, base: z.enum(["viewer", "shared"]).optional().default("viewer") }),
  z.object({ action: z.literal("check"), fixId, docxBase64, render: z.boolean().optional().default(true), against: z.enum(["viewer", "shared"]).optional().default("viewer") }),
  z.object({ action: z.literal("private"), fixId, docxBase64, note: replyNote, apply }),
  z.object({ action: z.literal("merge"), fixId, docxBase64, note: replyNote, why: z.string().trim().min(5, "why קצר מדי").max(1000), apply }),
  z.object({ action: z.literal("answer"), fixId, note: replyNote, apply }),
  z.object({ action: z.literal("reject"), fixId, note, apply }),
  z.object({ action: z.literal("removeVersion"), versionId: z.coerce.number().int().positive(), note, apply }),
]);
export type AgentRequest = z.infer<typeof agentRequestSchema>;

export type ParseResult = { ok: true; req: AgentRequest } | { ok: false; status: 400 | 413; error: string };

/** מפרסר גוף JSON גולמי (אחרי בדיקת גודל) */
export function parseAgentRequest(body: unknown, bodyBytes?: number): ParseResult {
  if (bodyBytes != null && bodyBytes > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: `גוף הבקשה ${bodyBytes} בתים – מעל המגבלה (${MAX_BODY_BYTES}); docx גדול מ-${Math.round(MAX_DOCX_BYTES / 1048576)}MB לא עובר ב-API, עבדו במצב ישיר` };
  }
  const r = agentRequestSchema.safeParse(body);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, status: 400, error: `${i.path.join(".") || "body"}: ${i.message}` };
  }
  return { ok: true, req: r.data };
}

/** base64 → bytes, עם בדיקת גודל אמיתית (לא רק אורך המחרוזת) */
export function decodeDocxBase64(b64: string): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const clean = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return { ok: false, error: "docxBase64 אינו base64 תקין" };
  const bytes = Buffer.from(clean, "base64");
  if (bytes.length > MAX_DOCX_BYTES) return { ok: false, error: `הקובץ ${bytes.length} בתים – מעל ${MAX_DOCX_BYTES}` };
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: false, error: "הקובץ אינו docx (לא מתחיל ב-PK)" };
  return { ok: true, bytes };
}

/** האם הסקריפט צריך לעבוד דרך ה-API (אין כלים ישירים) או ישירות */
export type EnvLike = Record<string, string | undefined>;

export function pickAgentMode(env: EnvLike, flags: { api?: boolean; direct?: boolean }): "api" | "direct" {
  if (flags.direct) return "direct";
  if (flags.api) return "api";
  const direct = !!(env.DATABASE_URL && env.DRIVE_BRIDGE_URL && env.DRIVE_BRIDGE_SECRET && env.ORACLE_CONVERT_URL);
  return direct ? "direct" : "api";
}

/** כתובת ה-API: AGENT_API_URL (או NEXT_PUBLIC_SITE_URL), בלי סלאש בסוף; חייבת להיות https (או localhost לפיתוח) */
export function agentApiBase(env: EnvLike): string | null {
  const raw = (env.AGENT_API_URL || env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (!/^https:\/\//.test(raw) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(raw)) return null;
  return raw;
}
