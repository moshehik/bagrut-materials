import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deckJobs, deckQueueState } from "@/db/schema";
import { bearerFrom, verifyAgentToken } from "@/lib/agent-api-auth";

/** סטטוס התור (לבדיקה מרחוק): Authorization: Bearer <CRON_SECRET>. לא מחזיר טקסטים של תכניות – רק מזהים, שלבים וספירות. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) return NextResponse.json({ ok: false, error: "CRON_SECRET לא מוגדר" }, { status: 503 });
  if (expected.length < 32) return NextResponse.json({ ok: false, error: "CRON_SECRET קצר מ-32 תווים" }, { status: 503 });
  if (!verifyAgentToken(bearerFrom(req.headers.get("authorization")), expected)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 401 });
  const [state] = await db.select().from(deckQueueState).where(eq(deckQueueState.id, 1)).limit(1);
  const byStage = await db.select({ stage: deckJobs.stage, n: sql<number>`count(*)::int` }).from(deckJobs).groupBy(deckJobs.stage);
  const recent = await db
    .select({ id: deckJobs.id, stage: deckJobs.stage, tries: deckJobs.tries, error: deckJobs.error, updatedAt: deckJobs.updatedAt })
    .from(deckJobs)
    .orderBy(desc(deckJobs.updatedAt))
    .limit(15);
  return NextResponse.json({ ok: true, state, byStage, recent });
}
