import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limitKey, rateLimit, TOO_MANY_MESSAGE } from "@/lib/rate-limit";
import { customerStatusText, isValidReference } from "@/lib/nedarim/logic";
import { getByReference } from "@/lib/nedarim/store";

/** GET /api/pay/status?ref=NP-… – סטטוס בקשת התשלום של המשתמשת המחוברת (לדף הסיום אחרי רענון / בזמן ההמתנה לאימות) */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "יש להתחבר" }, 401);
  const rl = await rateLimit({ key: limitKey("pay-status", "user", user.id), limit: 60, windowSec: 600 });
  if (!rl.ok) return json({ error: TOO_MANY_MESSAGE }, 429);
  const ref = req.nextUrl.searchParams.get("ref");
  if (!isValidReference(ref)) return json({ error: "מזהה בקשה לא תקין" }, 400);
  const row = await getByReference(ref);
  if (!row || row.userId !== user.id) return json({ error: "בקשה לא נמצאה" }, 404);
  return json({
    reference: row.reference,
    status: row.status,
    verified: row.verified,
    assistRequested: !!row.assistRequestedAt,
    text: customerStatusText(row.status, !!row.assistRequestedAt),
  });
}
