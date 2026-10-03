import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { getBool } from "@/lib/settings";
import { sendMailInBackground, templates } from "@/lib/mail";
import { isAdminEmail, randomToken, safeNextPath, uniquePersonalCode } from "@/lib/auth-utils";
import { G_STATE_COOKIE, exchangeGoogleCode, googleConfigured, googleRedirectUri } from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** קולבק מגוגל: אימות state, החלפת code, איתור/קישור/יצירת משתמשת, פתיחת session */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const fail = (q = "error=google") => {
    const r = NextResponse.redirect(new URL(`/login?${q}`, origin));
    r.cookies.delete(G_STATE_COOKIE);
    return r;
  };

  try {
    if (!googleConfigured() || !(await getBool("google_login_enabled"))) return fail();

    const sp = req.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state") ?? "";
    const cookieState = req.cookies.get(G_STATE_COOKIE)?.value ?? "";
    if (!code || !state || !cookieState || state !== cookieState) return fail();

    const dot = state.indexOf(".");
    const nextRaw = dot > 0 ? Buffer.from(state.slice(dot + 1), "base64url").toString("utf8") : "";
    const next = safeNextPath(nextRaw);

    const info = await exchangeGoogleCode(code, googleRedirectUri(req));
    const email = info.email?.trim().toLowerCase();
    if (!email) return fail();

    // 1) לפי googleId
    let [u] = await db.select().from(users).where(eq(users.googleId, info.sub)).limit(1);
    let created = false;

    if (!u) {
      // 2) לפי מייל – קישור חשבון קיים
      const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (byEmail) {
        await db
          .update(users)
          .set({
            googleId: info.sub,
            avatarUrl: info.picture ?? byEmail.avatarUrl,
            emailVerified: true,
          })
          .where(eq(users.id, byEmail.id));
        u = { ...byEmail, googleId: info.sub, avatarUrl: info.picture ?? byEmail.avatarUrl, emailVerified: true };
      } else {
        // 3) יצירת משתמשת חדשה
        if (!(await getBool("registration_open"))) return fail("error=registration_closed");
        const passwordHash = await bcrypt.hash(randomToken(24), 10);
        const personalCode = await uniquePersonalCode();
        const name = (info.name || info.given_name || email.split("@")[0]).slice(0, 120);
        const [row] = await db
          .insert(users)
          .values({
            name,
            email,
            passwordHash,
            personalCode,
            role: isAdminEmail(email) ? "admin" : "user",
            googleId: info.sub,
            avatarUrl: info.picture ?? null,
            emailVerified: true,
          })
          .returning();
        u = row;
        created = true;
        sendMailInBackground({
          to: email,
          ...templates.welcome(name, personalCode),
          kind: "welcome",
          userId: u.id,
        });
      }
    }

    if (u.suspended) {
      await logAudit({
        actorId: u.id,
        action: "login.failed",
        entityType: "user",
        entityId: u.id,
        details: { reason: "suspended", via: "google" },
      });
      return fail("suspended=1");
    }

    await createSession(u.id);
    await logAudit({
      actorId: u.id,
      action: created ? "register.google" : "login.google",
      entityType: "user",
      entityId: u.id,
    });

    // גוגל לא מוסר טלפון - נרשמת חדשה משלימה אותו מיד (ממילא תתבקש לפני הורדה)
    const dest = created && !u.phone ? `/account/phone?next=${encodeURIComponent(next)}` : next;
    const res = NextResponse.redirect(new URL(dest, origin));
    res.cookies.delete(G_STATE_COOKIE);
    return res;
  } catch (e) {
    console.error("[google-oauth] failed", e);
    return fail();
  }
}
