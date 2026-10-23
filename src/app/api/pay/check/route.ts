import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/http-utils";
import { limitKey, rateLimit, TOO_MANY_MESSAGE } from "@/lib/rate-limit";
import { loadNedarimConfig, simulateAllowed } from "@/lib/nedarim/config";
import { customerStatusText, isValidReference, orderKindOf, OPEN_STATUSES } from "@/lib/nedarim/logic";
import { describeIntent, getByReference, simulatedSettle, takeReturnCheck } from "@/lib/nedarim/store";
import { successHrefFor } from "@/lib/nedarim/items";
import { redactNedarim } from "@/lib/nedarim/secrets";
import { SYNC_USER_FLOOR_SEC, getSyncState, matchPendingPayments, nextAllowedAt, refreshHistory } from "@/lib/nedarim/sync";

/*
 * POST /api/pay/check { reference } – "שילמתי – בדקי עכשיו": מפעיל את שער הקריאה עם רצפה קצרה יותר (3 דק') ומריץ התאמה.
 * לא קורא ל-API של נדרים אם הקריאה האחרונה הייתה לפני פחות מזה – אז רק מתאים מול המטמון ומחזיר את המצב.
 * { reference, simulate: true } – מצב דמה בלבד (פיתוח מקומי): משלים בלי נדרים. רק בעלת הבקשה.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return json({ error: "בקשה לא מהאתר" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "יש להתחבר" }, 401);
  const rl = await rateLimit({ key: limitKey("pay-check", "user", user.id), limit: 8, windowSec: 600 });
  if (!rl.ok) return json({ error: TOO_MANY_MESSAGE }, 429);

  let body: { reference?: unknown; simulate?: unknown; returned?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "בקשה לא תקינה" }, 400);
  }
  if (!isValidReference(body.reference)) return json({ error: "מזהה בקשה לא תקין" }, 400);
  let row = await getByReference(body.reference);
  if (!row || row.userId !== user.id) return json({ error: "בקשה לא נמצאה" }, 404);

  try {
    const open = OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number]);
    let note = "";
    if (body.simulate === true) {
      if (!simulateAllowed()) return json({ error: "מצב דמה אינו פעיל" }, 403);
      if (open) await simulatedSettle(row);
    } else if (open && !row.assistRequestedAt) {
      const cfg = await loadNedarimConfig();
      if (cfg.hasApiPassword) {
        // חזרה מדף התשלום של נדרים: עד 3 בדיקות מיידיות לבקשה (בלי רצפת 3 הדק'); התשלום עדיין נקבע רק לפי ה-API
        const instant = body.returned === true && (await takeReturnCheck(row.id));
        const r = await refreshHistory(instant ? "return" : "user");
        if (!r.ran) {
          await matchPendingPayments(); // התאמה מול מה שכבר במטמון
          note = r.reason;
        } else if (!r.ok) {
          note = "לא הצלחנו לבדוק מול נדרים פלוס כרגע – ננסה שוב בעוד כמה דקות";
        }
      } else {
        note = "זיהוי אוטומטי של תשלומים עדיין לא הופעל – מנהלת האתר תאשר ידנית";
      }
    }
    row = (await getByReference(body.reference)) ?? row;
    const state = await getSyncState();
    return json({
      ok: true,
      reference: row.reference,
      status: row.status,
      verified: row.verified,
      assistRequested: !!row.assistRequestedAt,
      text: customerStatusText(row.status, !!row.assistRequestedAt, false, orderKindOf(row.plan)),
      kind: orderKindOf(row.plan),
      label: describeIntent(row),
      successHref: row.status === "paid" ? await successHrefFor(row) : null,
      note,
      lastCheckedAt: state?.lastSuccessAt ?? null,
      nextCheckAt: nextAllowedAt(state, SYNC_USER_FLOOR_SEC),
    });
  } catch (e) {
    console.error("[pay check] failed", redactNedarim(e instanceof Error ? e.message : String(e)));
    return json({ error: "אירעה שגיאה בבדיקה. אם שילמת – התשלום יזוהה, אין צורך לשלם שוב." }, 500);
  }
}
