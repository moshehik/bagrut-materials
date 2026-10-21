import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limitKey, rateLimit, TOO_MANY_MESSAGE } from "@/lib/rate-limit";
import { adminEmail } from "@/lib/mail";
import { getSetting } from "@/lib/settings";
import { customerStatusText, isValidReference } from "@/lib/nedarim/logic";
import { getByReference, requestAssist } from "@/lib/nedarim/store";

/*
 * POST /api/pay/assist { reference } – החלופה לנטפרי: טופס נדרים (matara.pro, דומיין צד-שלישי) לא נטען אצל המורה, והיא מבקשת
 * להשלים את התשלום דרך המנהלת. הבקשה נשארת פתוחה (pending) ומסומנת, המנהלת מקבלת מייל, ואחרי שהתשלום יתקבל בדרך אחרת –
 * "אשר ידנית" ב-/admin/payments פותח את המנוי. CLAUDE.md, סעיף Netfree.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "יש להתחבר" }, 401);
  const rl = await rateLimit({ key: limitKey("pay-assist", "user", user.id), limit: 5, windowSec: 3600 });
  if (!rl.ok) return json({ error: TOO_MANY_MESSAGE }, 429);
  let body: { reference?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "בקשה לא תקינה" }, 400);
  }
  if (!isValidReference(body.reference)) return json({ error: "מזהה בקשה לא תקין" }, 400);
  const row = await getByReference(body.reference);
  if (!row || row.userId !== user.id) return json({ error: "בקשה לא נמצאה" }, 404);
  const to = adminEmail() ?? (await getSetting("admin_email")).trim() ?? null;
  const r = await requestAssist(row, to || null);
  if (!r.ok) return json({ error: r.error }, 409);
  return json({ ok: true, reference: row.reference, status: row.status, text: customerStatusText(row.status, true) });
}
