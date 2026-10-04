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
  const failed = async (reason: string) => {
    await logAudit({ action: "email.verify_failed", entityType: "user", details: { reason } });
    return to("verified=0");
  };
  if (!token) return failed("missing_token");

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
    if (!t) return failed("invalid_or_expired");

    await db.update(users).set({ emailVerified: true }).where(eq(users.id, t.userId));
    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
    await logAudit({ actorId: t.userId, action: "email.verified", entityType: "user", entityId: t.userId });
    return to("verified=1");
  } catch (e) {
    console.error("[verify] failed", e);
    return failed("error");
  }
}
