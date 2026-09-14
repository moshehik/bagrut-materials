import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { searchCatalog } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** חיפוש קטלוג (קטגוריות + חומרים) עבור תיבת החיפוש בתפריט */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const user = await getCurrentUser();
    const results = await searchCatalog(q, user?.role === "admin");
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
