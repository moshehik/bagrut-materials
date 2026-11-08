import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limitKey, rateLimit } from "@/lib/rate-limit";
import { getCorrectionSignatures } from "@/lib/private-versions";

/*
 * GET /api/my-correction-status?ids=1,2 – חתימה קצרה לכל חומר (ר' correctionSignature) של ההערות הכלליות של המשתמשת המחוברת.
 * מיועד לבדיקה זולה מהדפדפן (components/correction-live.tsx, גם בחלון עריכת השינויים): שתי שאילתות קלות במקביל (מזהים וסטטוסים בלבד, לפי אינדקס), עד 20 חומרים,
 * 60 בקשות לשעה למשתמשת, בלי נתונים רגישים. הלקוח מפחית תדירות (backoff), עוצר בכרטיסייה ברקע, ומרענן את הדף רק כשהחתימה השתנתה.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ sigs: {} }, 401);
  const rl = await rateLimit({ key: limitKey("my-correction-status", "user", user.id), limit: 120, windowSec: 3600 });
  if (!rl.ok) return json({ sigs: {} }, 429);
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 20);
  if (ids.length === 0) return json({ sigs: {} });
  const map = await getCorrectionSignatures(ids, user.id);
  const sigs: Record<string, string> = {};
  for (const id of ids) sigs[id] = map.get(id) ?? "none";
  return json({ sigs });
}
