import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limitKey, rateLimit, TOO_MANY_MESSAGE } from "@/lib/rate-limit";
import { loadNedarimConfig } from "@/lib/nedarim/config";
import { INTENT_TTL_HOURS, customerStatusText, describeTerms, isStaleProcessing, isValidReference, orderKindOf, termsOfPayment, OPEN_STATUSES } from "@/lib/nedarim/logic";
import { describeIntent, expireStale, getByReference } from "@/lib/nedarim/store";
import { hostedUrlFor } from "@/lib/nedarim/hosted";
import { successHrefFor } from "@/lib/nedarim/items";
import { SYNC_MIN_INTERVAL_SEC, getSyncState, nextAllowedAt, refreshHistory } from "@/lib/nedarim/sync";

/**
 * GET /api/pay/status?ref=NP-… – סטטוס בקשת התשלום של המשתמשת המחוברת (polling מדף ההמתנה / אחרי חזרה מנדרים).
 * ה-polling לא קורא ל-API של נדרים ישירות: הוא מפעיל את השער (refreshHistory "poll"), שקורא רק אם עברו ≥4 דק' מהקריאה
 * הקודמת – אחרת מחזיר את המצב מה-DB. בקשה שכבר הוכרעה לא מפעילה כלום.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "יש להתחבר" }, 401);
  const rl = await rateLimit({ key: limitKey("pay-status", "user", user.id), limit: 60, windowSec: 600 });
  if (!rl.ok) return json({ error: TOO_MANY_MESSAGE }, 429);
  const ref = req.nextUrl.searchParams.get("ref");
  if (!isValidReference(ref)) return json({ error: "מזהה בקשה לא תקין" }, 400);
  let row = await getByReference(ref);
  if (!row || row.userId !== user.id) return json({ error: "בקשה לא נמצאה" }, 404);
  // L6: בקשה ממתינה שעברה את חלון ה-TTL מוצגת למורה כפגה (ולא "ממתינים")
  if (row.status === "pending" && row.createdAt.getTime() < Date.now() - INTENT_TTL_HOURS * 3600_000) {
    await expireStale();
    row = (await getByReference(ref)) ?? row;
  }

  const cfg = await loadNedarimConfig();
  const open = OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number]) && !row.assistRequestedAt;
  if (open && cfg.hasApiPassword) {
    await refreshHistory("poll"); // כולל matchPendingPayments כשבוצעה קריאה
    row = (await getByReference(ref)) ?? row;
  }
  const state = await getSyncState();
  const next = nextAllowedAt(state, SYNC_MIN_INTERVAL_SEC);
  const kind = orderKindOf(row.plan);
  return json({
    reference: row.reference,
    status: row.status,
    verified: row.verified,
    assistRequested: !!row.assistRequestedAt,
    text: customerStatusText(row.status, !!row.assistRequestedAt, isStaleProcessing(row.status, row.createdAt), kind),
    stale: isStaleProcessing(row.status, row.createdAt),
    // סוג ההזמנה + תיאור + לאן להמשיך אחרי "שולם" – כדי שדף ההמתנה יציג נכון גם אחרי רענון / חזרה מנדרים (?ref= בלבד)
    kind,
    amount: row.amount,
    listAmount: row.listAmount,
    couponPercent: row.couponPercent,
    label: describeIntent(row),
    termsText: describeTerms(termsOfPayment(row)),
    successHref: row.status === "paid" ? await successHrefFor(row) : null,
    hostedUrl: open && cfg.mosadId ? hostedUrlFor(row, cfg.mosadId) : null,
    lastCheckedAt: state?.lastSuccessAt ?? null,
    nextCheckAt: next,
    autoCheck: cfg.hasApiPassword,
  });
}
