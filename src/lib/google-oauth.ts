import type { NextRequest } from "next/server";

export const G_STATE_COOKIE = "g_state";

/** ה-origin של האתר לצורך redirect_uri (עדיפות ל-NEXT_PUBLIC_SITE_URL) */
export function siteOrigin(req: NextRequest) {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return env || req.nextUrl.origin;
}

export function googleRedirectUri(req: NextRequest) {
  return `${siteOrigin(req)}/api/auth/google/callback`;
}

/** האם התחברות עם גוגל מוגדרת בסביבה */
export function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
};

/** החלפת code ב-access token ושליפת פרטי המשתמשת */
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleUserInfo> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) throw new Error("no access_token");

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
    cache: "no-store",
  });
  if (!infoRes.ok) throw new Error(`userinfo failed: ${infoRes.status}`);
  const info = (await infoRes.json()) as GoogleUserInfo;
  if (!info.sub) throw new Error("userinfo missing sub");
  return info;
}
