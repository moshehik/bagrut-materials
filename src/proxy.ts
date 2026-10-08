import { NextResponse, type NextRequest } from "next/server";

/**
 * הגנה על אזורים שדורשים התחברות.
 * בודק רק נוכחות עוגיית session (Edge runtime – ללא גישה ל-DB);
 * האימות המלא של הטוקן מתבצע בשרת ב-getCurrentUser.
 */
const SESSION_COOKIE = "bagrut_session";

export function proxy(request: NextRequest) {
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    // הדיונים דורשים התחברות; /forum עצמו רק מפנה ליחידות
    "/forum/:path+",
    "/checkout/:path*",
    "/sell/:path*",
  ],
};
