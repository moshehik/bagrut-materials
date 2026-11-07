import { NextResponse, type NextRequest } from "next/server";
import { logAudit, requestMeta } from "@/lib/audit";
import { limitKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * דיווח אוטומטי על תקלה בצד הדפדפן (מ-error.tsx) – כדי לראות מה בדיוק נפל אצל מי שגולשת דרך מסנן תוכן (נטפרי).
 * נשמר בלוג הפעולות (action = client.error). רק מהאתר עצמו, עם הגבלת קצב; לא נשמר מידע אישי.
 */
export async function POST(req: NextRequest) {
  try {
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return new NextResponse(null, { status: 403 });
    const { ip, userAgent } = await requestMeta();
    const rl = await rateLimit({ key: limitKey("client-error", "ip", ip ?? "unknown"), limit: 10, windowSec: 600 });
    if (!rl.ok) return new NextResponse(null, { status: 429 });
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
    await logAudit({
      action: "client.error",
      details: {
        message: s(b.message, 500),
        stack: s(b.stack, 1500),
        digest: s(b.digest, 60),
        path: s(b.path, 300),
        ua: userAgent?.slice(0, 200) ?? null,
        failedResources: Array.isArray(b.failed) ? b.failed.slice(0, 15).map((x) => s(x, 200)) : null,
      },
    });
  } catch {
    /* דיווח – לעולם לא נכשל */
  }
  return new NextResponse(null, { status: 204 });
}
