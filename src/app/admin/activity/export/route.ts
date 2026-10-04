import { type NextRequest } from "next/server";
import { and, desc, eq, gte, ilike, isNotNull, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { pageViews, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { parseDate, toCsv, csvResponse } from "@/lib/admin-analytics";
import { shortUA } from "@/lib/ua";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("forbidden", { status: 403 });

  const q = req.nextUrl.searchParams;
  const userQ = (q.get("user") ?? "").trim();
  const pathQ = (q.get("path") ?? "").trim();
  const from = parseDate(q.get("from") ?? "");
  const to = parseDate(q.get("to") ?? "", true);
  const onlyLoggedIn = q.get("li") === "1";

  const conds: SQL[] = [];
  if (/^\d+$/.test(userQ)) conds.push(eq(pageViews.userId, Number(userQ)));
  else if (userQ) conds.push(or(ilike(users.email, `%${userQ}%`), ilike(users.name, `%${userQ}%`))!);
  if (pathQ) conds.push(ilike(pageViews.path, `%${pathQ}%`));
  if (from) conds.push(gte(pageViews.createdAt, from));
  if (to) conds.push(lte(pageViews.createdAt, to));
  if (onlyLoggedIn) conds.push(isNotNull(pageViews.userId));

  const rows = await db
    .select({
      id: pageViews.id,
      createdAt: pageViews.createdAt,
      userId: pageViews.userId,
      userName: users.name,
      userEmail: users.email,
      sessionId: pageViews.sessionId,
      path: pageViews.path,
      duration: pageViews.duration,
      referer: pageViews.referer,
      ip: pageViews.ip,
      userAgent: pageViews.userAgent,
    })
    .from(pageViews)
    .leftJoin(users, eq(pageViews.userId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(pageViews.createdAt))
    .limit(50000);

  const csv = toCsv(
    ["מזהה", "זמן", "מזהה משתמשת", "שם", "מייל", "סשן", "נתיב", "משך (שניות)", "מקור", "IP", "דפדפן", "User-Agent"],
    rows.map((r) => [
      r.id,
      r.createdAt.toISOString(),
      r.userId,
      r.userName,
      r.userEmail,
      r.sessionId,
      r.path,
      r.duration,
      r.referer,
      r.ip,
      shortUA(r.userAgent),
      r.userAgent,
    ]),
  );
  // רישום ייצוא נתוני פעילות (מידע אישי של משתמשות) ביומן הפעולות
  await logAudit({
    actorId: user.id,
    action: "activity.export",
    entityType: "page_view",
    details: {
      rows: rows.length,
      filters: { user: userQ || null, path: pathQ || null, from: q.get("from") || null, to: q.get("to") || null, loggedInOnly: onlyLoggedIn },
    },
  });
  return csvResponse(`activity-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
