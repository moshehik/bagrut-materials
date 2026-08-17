import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** אימות כתובת מייל דרך קישור מהמייל: /api/auth/verify?token=... */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const to = (q: string) => NextResponse.redirect(new URL(`/account?${q}`, req.nextUrl.origin));
  if (!token) return to("verified=0");

  try {
    const [t] = await db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.token, token),
          eq(authTokens.purpose, "verify"),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!t) return to("verified=0");

    await db.update(users).set({ emailVerified: true }).where(eq(users.id, t.userId));
    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
    await logAudit({ actorId: t.userId, action: "email.verified", entityType: "user", entityId: t.userId });
    return to("verified=1");
  } catch (e) {
    console.error("[verify] failed", e);
    return to("verified=0");
  }
}
