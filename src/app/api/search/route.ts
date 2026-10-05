import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { searchCatalog } from "@/lib/data";
import { clientIp, limitKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** אורך מקסימלי למונח חיפוש – מעבר לזה זה לא חיפוש אמיתי */
const MAX_Q_LEN = 60;
/** הגבלת קצב: 30 חיפושים לדקה לכל IP (התיבה שולחת אחרי debounce) */
const RATE_LIMIT_PER_MIN = 30;

/** חיפוש קטלוג (קטגוריות + חומרים) עבור תיבת החיפוש בתפריט */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, MAX_Q_LEN);
    if (q.trim().length < 2) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });

    const rl = await rateLimit({ key: limitKey("search", "ip", await clientIp()), limit: RATE_LIMIT_PER_MIN, windowSec: 60 });
    if (!rl.ok) {
      return NextResponse.json(
        { results: [] },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const user = await getCurrentUser();
    const results = await searchCatalog(q, user?.role === "admin");
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
