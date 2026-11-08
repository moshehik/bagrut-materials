import { NextResponse, type NextRequest } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/http-utils";
import { limitKey, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { DL_TOKEN_RE } from "@/lib/download-ready";
import { releaseFailedDownload } from "@/lib/download-quota";

/*
 * POST /api/download-failed { token } – הורדה שנכשלה בצד הדפדפן לא נספרת במכסה.
 * קורה כשהשרת כבר שלח את הקובץ (ונספר) אבל הדפדפן לא קיבל אותו – בדרך כלל נטפרי הוריד אותו דרך ה-proxy וחסם.
 * DownloadLoader מדווח כאן אחרי 75 שניות בלי עוגיית dl_<token>. מחזירים רק שורות של המשתמשת המחוברת עצמה,
 * לפי הטוקן שנרשם בהזמנת המכסה (reserveDownloads), ורק שורות בנות דקה עד 20 דקות. הלקוח לא מקבל אמון על שום דבר חוץ מהטוקן.
 * חסם נגד ניצול: מעל MAX_RELEASES_PER_DAY שחרורים ב-24 שעות – לא משחררים יותר (released: 0).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RELEASES_PER_DAY = 10;
const ACTION = "download.client_failed";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return json({ error: "forbidden" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const rl = await rateLimit({ key: limitKey("download-failed", "user", user.id), limit: 20, windowSec: 3600 });
  if (!rl.ok) return json({ ok: true, released: 0 }, 429);

  let token = "";
  try {
    const raw = await req.text();
    if (raw.length > 512) return json({ error: "bad request" }, 413);
    const body = JSON.parse(raw || "{}") as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!DL_TOKEN_RE.test(token)) return json({ error: "bad request" }, 400);

  try {
    // חסם יומי: כמה פעמים כבר שוחררה לה הורדה שנכשלה ב-24 השעות האחרונות
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.actorId, user.id), eq(auditLogs.action, ACTION), gte(auditLogs.createdAt, since)));
    if (Number(row?.n ?? 0) > MAX_RELEASES_PER_DAY) return json({ ok: true, released: 0 });

    const released = await releaseFailedDownload({ userId: user.id, token });
    // נרשם רק כששוחרר משהו – כך שגם ספירת החסם היומי סופרת שחרורים אמיתיים בלבד
    if (released > 0) await logAudit({ actorId: user.id, action: ACTION, details: { released } });
    return json({ ok: true, released });
  } catch (e) {
    console.error("download-failed release error", e);
    return json({ ok: false, released: 0 }, 500);
  }
}
