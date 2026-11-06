import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/http-utils";
import { limitKey, rateLimit, TOO_MANY_MESSAGE } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { hasActiveSamePlan } from "@/lib/purchase-helpers";
import { campaignIsOpen, claimSeat, getCampaign } from "@/lib/campaign";

/*
 * POST /api/campaign/<slug>/claim – מורה מחוברת תופסת מקום במבצע (נשמר SEAT_HOLD_MINUTES עד שנוצרת בקשת תשלום). אחר כך ממשיכות
 * ל-/pay?plan=yearly&campaign=<slug>, שם הסכום המוזל נקבע בשרת (/api/pay/intent). אם כבר יש לה מקום – מחזירים אותו (idempotent).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!isSameOriginRequest(req)) return json({ error: "בקשה לא מהאתר" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "יש להתחבר כדי לתפוס מקום" }, 401);
  if (user.suspended) return json({ error: "החשבון מושהה" }, 403);

  const rl = await rateLimit({ key: limitKey("campaign-claim", "user", user.id), limit: 8, windowSec: 600 });
  if (!rl.ok) return json({ error: TOO_MANY_MESSAGE }, 429);

  const { slug } = await ctx.params;
  const c = await getCampaign(slug);
  if (!c || !campaignIsOpen(c)) return json({ error: "המבצע הסתיים", soldOut: true }, 409);

  // כבר יש מנוי פעיל מאותו מסלול – המבצע מיועד למנויות חדשות
  if (await hasActiveSamePlan(user.id, c.plan as "yearly")) {
    return json({ error: "כבר יש לך מנוי שנתי פעיל – המבצע מיועד למנויות חדשות.", alreadySubscribed: true }, 409);
  }

  const r = await claimSeat(c, user.id);
  if (!r.ok) return json({ error: "כל המקומות במבצע נתפסו", soldOut: true }, 409);
  if (!r.already) await logAudit({ actorId: user.id, action: "campaign.claim", entityType: "campaign", entityId: undefined, details: { slug: c.slug, slot: r.seat.slot } });
  return json({ ok: true, already: r.already, next: `/pay?plan=${c.plan}&campaign=${c.slug}` });
}
