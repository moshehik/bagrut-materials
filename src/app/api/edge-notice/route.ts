import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/http-utils";
import { limitKey, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

/*
 * ההודעה "במצגת שמורידים בנטפרי הרקע עלול להיות לבן ב-Edge" (src/components/presentation-download.tsx).
 *  GET  → { dismissed } – האם המשתמשת המחוברת סימנה "אל תציגי לי שוב" (הפעולה האחרונה שלה ביומן; נשמר פר-משתמשת, לא פר-דפדפן).
 *  POST { action: "shown" | "dismissed" | "regular" | "hq" } – נרשם ביומן הביקורת (audit_logs): action = edge_notice.<action>.
 * אין טבלה ייעודית: היומן הוא המקור, ולכן ההעדפה והלוג הם אותו דבר.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["shown", "dismissed", "regular", "hq"] as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ dismissed: false });
  try {
    const [last] = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(and(eq(auditLogs.actorId, user.id), inArray(auditLogs.action, ["edge_notice.dismissed", "edge_notice.undismissed"])))
      .orderBy(desc(auditLogs.id))
      .limit(1);
    return json({ dismissed: last?.action === "edge_notice.dismissed" });
  } catch {
    return json({ dismissed: false });
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return json({ error: "forbidden" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ ok: false }, 401);
  const rl = await rateLimit({ key: limitKey("edge-notice", "user", user.id), limit: 60, windowSec: 3600 });
  if (!rl.ok) return json({ ok: true });
  let action = "";
  try {
    const body = (await req.json()) as { action?: unknown };
    action = typeof body.action === "string" ? body.action : "";
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!(ACTIONS as readonly string[]).includes(action)) return json({ error: "bad request" }, 400);
  await logAudit({ actorId: user.id, action: `edge_notice.${action}`, details: { ua: (req.headers.get("user-agent") ?? "").slice(0, 160) } });
  return json({ ok: true });
}
