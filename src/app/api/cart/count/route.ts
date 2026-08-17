import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { cartCount } from "@/lib/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** מספר הפריטים בעגלה של המשתמשת המחוברת (0 לאורחת) */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const count = user ? await cartCount(user.id) : 0;
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
}
