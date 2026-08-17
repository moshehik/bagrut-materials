import { NextResponse, type NextRequest } from "next/server";
import { randomToken, safeNextPath } from "@/lib/auth-utils";
import { getBool } from "@/lib/settings";
import { G_STATE_COOKIE, googleConfigured, googleRedirectUri } from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * התחלת התחברות עם גוגל (OAuth 2.0 authorization code, ללא ספרייה).
 * /api/auth/google?next=/some/path
 */
export async function GET(req: NextRequest) {
  const loginUrl = new URL("/login", req.nextUrl.origin);
  if (!googleConfigured() || !(await getBool("google_login_enabled"))) {
    loginUrl.searchParams.set("error", "google");
    return NextResponse.redirect(loginUrl);
  }

  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const nonce = randomToken(16);
  // state = nonce.next(base64url) – מאומת בקולבק מול העוגייה
  const state = `${nonce}.${Buffer.from(next).toString("base64url")}`;

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  auth.searchParams.set("redirect_uri", googleRedirectUri(req));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("prompt", "select_account");
  auth.searchParams.set("access_type", "online");

  const res = NextResponse.redirect(auth);
  res.cookies.set(G_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return res;
}
