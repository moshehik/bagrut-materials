import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limitKey, rateLimit, TOO_MANY_MESSAGE } from "@/lib/rate-limit";
import { loadNedarimConfig } from "@/lib/nedarim/config";
import { MAX_BODY_BYTES, customerStatusText, isValidReference } from "@/lib/nedarim/logic";
import { getByReference, recordClientResponse, verifyAndSettle } from "@/lib/nedarim/store";

/*
 * POST /api/pay/complete – הדפדפן מדווח מה ה-iframe של נדרים החזיר (TransactionResponse.Value). זה טריגר בלבד: השרת מאמת מול
 * נדרים (GetHistoryJson) או משאיר "ממתין לאימות" עד ה-CallBack / אישור המנהלת. { reference, response } או – במצב דמה בלבד –
 * { reference, simulate: true }. רק בעלת הבקשה יכולה לדווח. docs/nedarim-payments.md
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "יש להתחבר" }, 401);
  const rl = await rateLimit({ key: limitKey("pay-complete", "user", user.id), limit: 30, windowSec: 600 });
  if (!rl.ok) return json({ error: TOO_MANY_MESSAGE }, 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES * 4) return json({ error: "הבקשה גדולה מדי" }, 413);
  let body: { reference?: unknown; response?: unknown; simulate?: unknown } = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json({ error: "בקשה לא תקינה" }, 400);
  }
  if (!isValidReference(body.reference)) return json({ error: "מזהה בקשה לא תקין" }, 400);

  const row = await getByReference(body.reference);
  if (!row || row.userId !== user.id) return json({ error: "בקשה לא נמצאה" }, 404);
  const cfg = await loadNedarimConfig();

  try {
    let result;
    if (body.simulate === true) {
      if (!cfg.simulate) return json({ error: "מצב דמה אינו פעיל" }, 403);
      result = await verifyAndSettle(row.id, { cfg, simulated: true });
    } else {
      const value = body.response && typeof body.response === "object" ? body.response : {};
      result = await recordClientResponse(row, value, cfg);
    }
    if (!result.ok) return json({ error: result.error }, 500);
    const fresh = await getByReference(row.reference);
    const status = fresh?.status ?? result.status;
    return json({
      ok: true,
      reference: row.reference,
      status,
      verified: fresh?.verified ?? false,
      text: customerStatusText(status, !!fresh?.assistRequestedAt),
      message: "message" in result ? result.message : undefined,
    });
  } catch (e) {
    console.error("[pay complete] failed", e);
    return json({ error: "אירעה שגיאה ברישום התשלום. אם חויבת – התשלום יירשם, אין צורך לשלם שוב." }, 500);
  }
}
