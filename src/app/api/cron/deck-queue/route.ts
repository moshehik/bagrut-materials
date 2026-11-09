import { NextResponse } from "next/server";
import { bearerFrom, verifyAgentToken } from "@/lib/agent-api-auth";
import { runDeckQueueTick } from "@/lib/deck-queue/tick";

/**
 * כרון של Vercel (vercel.json, כל דקה): מקדם את תור הפקת המצגות בנוטבוק. Vercel שולח Authorization: Bearer <CRON_SECRET>.
 * ה-tick עצמו נועל (deck_queue_state) ולכן הפעלה כפולה/חופפת של כרון (best effort) בטוחה. תקרת זמן 300s (הורדת PDF + העלאה לדרייב).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) return NextResponse.json({ ok: false, error: "CRON_SECRET לא מוגדר" }, { status: 503 });
  if (expected.length < 32) return NextResponse.json({ ok: false, error: "CRON_SECRET קצר מ-32 תווים" }, { status: 503 });
  if (!verifyAgentToken(bearerFrom(req.headers.get("authorization")), expected)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 401 });
  try {
    const r = await runDeckQueueTick();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[deck-queue] tick crashed:", e instanceof Error ? e.message : "error");
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }, { status: 500 });
  }
}
