import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pageViews, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getBool } from "@/lib/settings";
import { requestMeta, logAudit } from "@/lib/audit";
import { limitKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SID_COOKIE = "bagrut_sid";
/** הגבלת קצב: 60 בקשות לדקה לכל IP (הדפדפן שולח כ-2 לכל דף) */
const RATE_LIMIT_PER_MIN = 60;
const MAX_UA_LEN = 300;
const IGNORED_PREFIXES = ["/_next", "/api", "/admin"];
// בוטים/סורקים/תצוגות מקדימות – לא נספרים כצפיות אמיתיות
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit/i;

function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  let p = raw;
  // פרטיות: מסירים query, חוץ מ-/subjects (שם ה-query הוא חלק מהניווט). מונחי חיפוש לא נשמרים.
  if (!p.startsWith("/subjects")) {
    const q = p.indexOf("?");
    if (q >= 0) p = p.slice(0, q);
  }
  const h = p.indexOf("#");
  if (h >= 0) p = p.slice(0, h);
  return p.slice(0, 500);
}

export async function POST(req: NextRequest) {
  try {
    // רק מהאתר עצמו: דפדפן מודרני שולח sec-fetch-site; ערך של אתר זר = בקשה cross-site, לא שלנו
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
      return new NextResponse(null, { status: 403 });
    }

    const { ip, userAgent: rawUa } = await requestMeta();
    const userAgent = rawUa ? rawUa.slice(0, MAX_UA_LEN) : null;

    const rl = await rateLimit({ key: limitKey("track", "ip", ip ?? "unknown"), limit: RATE_LIMIT_PER_MIN, windowSec: 60 });
    if (!rl.ok) {
      return new NextResponse(null, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      /* גוף ריק / לא תקין */
    }

    const user = await getCurrentUser();

    // מזהה סשן אנונימי
    const jar = await cookies();
    let sid = jar.get(SID_COOKIE)?.value ?? null;
    let setSid = false;
    if (!sid || sid.length > 64) {
      sid = crypto.randomUUID();
      setSid = true;
    }

    const respond = (data: unknown, status = 200) => {
      const res = data === null ? new NextResponse(null, { status: 204 }) : NextResponse.json(data, { status });
      if (setSid) {
        res.cookies.set(SID_COOKIE, sid!, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
        });
      }
      return res;
    };

    // עדכון משך שהייה לצפייה קיימת
    const viewId = Number(body.viewId);
    const duration = Number(body.duration);
    if (Number.isInteger(viewId) && viewId > 0 && Number.isFinite(duration) && duration >= 0) {
      const dur = Math.min(Math.round(duration), 60 * 60 * 12);
      const owner = user ? eq(pageViews.userId, user.id) : and(isNull(pageViews.userId), eq(pageViews.sessionId, sid));
      await db
        .update(pageViews)
        .set({ duration: dur })
        .where(and(eq(pageViews.id, viewId), owner));
      if (user) {
        await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
      }
      return respond({ viewId });
    }

    const path = cleanPath(body.path);
    if (!path) return respond(null);

    const ignored = IGNORED_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));
    const referer =
      typeof body.referer === "string" && body.referer ? body.referer.slice(0, 1000) : null;

    // נוכחות – תמיד (גם באזור הניהול)
    if (user) {
      await db
        .update(users)
        .set({ lastSeenAt: new Date(), lastIp: ip, lastPath: path })
        .where(eq(users.id, user.id));
    }

    if (ignored) return respond(null);
    if (!(await getBool("track_page_views"))) return respond(null);
    // בוטים: לא רושמים צפייה (נוכחות של משתמשות אמיתיות כבר עודכנה למעלה)
    if (userAgent && BOT_UA.test(userAgent)) return respond(null);

    const [row] = await db
      .insert(pageViews)
      .values({
        userId: user?.id ?? null,
        sessionId: sid,
        path,
        referer,
        ip,
        userAgent,
      })
      .returning({ id: pageViews.id });

    return respond({ viewId: row?.id ?? null });
  } catch (e) {
    console.error("[track] failed", e);
    await logAudit({
      action: "track.failed",
      details: { error: (e instanceof Error ? e.message : String(e)).slice(0, 300) },
    });
    return new NextResponse(null, { status: 204 });
  }
}
