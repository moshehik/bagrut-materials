import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** אישור שינוי כתובת מייל דרך קישור מהמייל: /api/auth/confirm-email-change?token=... */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const to = (q: string) => NextResponse.redirect(new URL(`/account?${q}`, req.nextUrl.origin));
  const failed = async (reason: string, actorId?: number) => {
    await logAudit({
      actorId: actorId ?? null,
      action: "profile.email_change_failed",
      entityType: "user",
      entityId: actorId ?? null,
      details: { reason },
    });
    return to("emailchange=0");
  };
  if (!token) return failed("missing_token");

  try {
    const [t] = await db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.token, token),
          eq(authTokens.purpose, "change_email"),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!t) return failed("invalid_or_expired");

    const [u] = await db.select().from(users).where(eq(users.id, t.userId)).limit(1);
    if (!u || !u.pendingEmail) return failed("no_pending_email", t.userId);

    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, u.pendingEmail));
    if (dup && dup.id !== u.id) return failed("email_taken", u.id);

    const oldEmail = u.email; // לפני הדריסה – לצורך היומן
    const newEmail = u.pendingEmail;
    await db
      .update(users)
      .set({ email: u.pendingEmail, pendingEmail: null, emailVerified: true })
      .where(eq(users.id, u.id));
    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
    await logAudit({
      actorId: u.id,
      action: "profile.email_changed",
      entityType: "user",
      entityId: u.id,
      details: { from: oldEmail, to: newEmail },
    });
    return to("emailchange=1");
  } catch (e) {
    console.error("[confirm-email-change] failed", e);
    return failed("error");
  }
}
