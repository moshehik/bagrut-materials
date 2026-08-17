import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pageViews, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { requestMeta } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Heartbeat – נוכחות + עדכון משך שהייה. זול, לעולם לא זורק. */
export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    const user = await getCurrentUser();

    if (user) {
      const { ip } = await requestMeta();
      const lastPath =
        typeof body.lastPath === "string" && body.lastPath.startsWith("/")
          ? body.lastPath.slice(0, 500)
          : undefined;
      await db
        .update(users)
        .set({ lastSeenAt: new Date(), lastIp: ip, ...(lastPath ? { lastPath } : {}) })
        .where(eq(users.id, user.id));
    }

    const viewId = Number(body.viewId);
    const duration = Number(body.duration);
    if (Number.isInteger(viewId) && viewId > 0 && Number.isFinite(duration) && duration >= 0) {
      const sid = (await cookies()).get("bagrut_sid")?.value ?? null;
      const owner = user
        ? eq(pageViews.userId, user.id)
        : sid
          ? and(isNull(pageViews.userId), eq(pageViews.sessionId, sid))
          : null;
      if (owner) {
        await db
          .update(pageViews)
          .set({ duration: Math.min(Math.round(duration), 60 * 60 * 12) })
          .where(and(eq(pageViews.id, viewId), owner));
      }
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[presence] failed", e);
    return new NextResponse(null, { status: 204 });
  }
}
