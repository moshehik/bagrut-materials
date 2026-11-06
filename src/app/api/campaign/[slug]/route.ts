import { NextResponse, type NextRequest } from "next/server";
import { campaignIsOpen, getCampaign, getSeatStats } from "@/lib/campaign";

/*
 * GET /api/campaign/<slug> – המונה החי של דף המבצע (/offer/<slug>): כמה מקומות נשארו. ציבורי (בלי פרטים אישיים), נשמר
 * במטמון של שניות ספורות כדי שכמה מאות מבקרות מפרסומת לא יפעילו שאילתה כל אחת.
 */
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const c = await getCampaign(slug);
  if (!c) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  const stats = await getSeatStats(c);
  const open = campaignIsOpen(c);
  return NextResponse.json(
    { total: stats.total, remaining: open ? stats.remaining : 0, open },
    { headers: { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10" } },
  );
}
