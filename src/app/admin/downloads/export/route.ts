import { type NextRequest } from "next/server";
import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, downloads, materials, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { parseDate, toCsv, csvResponse } from "@/lib/admin-analytics";
import { MATERIAL_KINDS } from "@/lib/constants";
import { shortUA } from "@/lib/ua";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("forbidden", { status: 403 });

  const q = req.nextUrl.searchParams;
  const userQ = (q.get("user") ?? "").trim();
  const materialQ = (q.get("material") ?? "").trim();
  const from = parseDate(q.get("from") ?? "");
  const to = parseDate(q.get("to") ?? "", true);

  const conds: SQL[] = [];
  if (/^\d+$/.test(userQ)) conds.push(eq(downloads.userId, Number(userQ)));
  else if (userQ)
    conds.push(
      or(ilike(users.email, `%${userQ}%`), ilike(users.name, `%${userQ}%`), ilike(users.personalCode, `%${userQ}%`))!,
    );
  if (/^\d+$/.test(materialQ)) conds.push(eq(downloads.materialId, Number(materialQ)));
  else if (materialQ) conds.push(ilike(materials.title, `%${materialQ}%`));
  if (from) conds.push(gte(downloads.createdAt, from));
  if (to) conds.push(lte(downloads.createdAt, to));

  const [rows, cats] = await Promise.all([
    db
      .select({
        id: downloads.id,
        createdAt: downloads.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        personalCode: users.personalCode,
        materialId: materials.id,
        materialTitle: materials.title,
        kind: materials.kind,
        categoryId: materials.categoryId,
        via: downloads.via,
        watermark: downloads.watermark,
        ip: downloads.ip,
        userAgent: downloads.userAgent,
      })
      .from(downloads)
      .innerJoin(users, eq(downloads.userId, users.id))
      .innerJoin(materials, eq(downloads.materialId, materials.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(downloads.createdAt))
      .limit(50000),
    db.select({ id: categories.id, parentId: categories.parentId, title: categories.title }).from(categories),
  ]);

  const byId = new Map(cats.map((c) => [c.id, c]));
  const pathOf = (id: number) => {
    const parts: string[] = [];
    let cur: number | null = id;
    let g = 0;
    while (cur !== null && g++ < 20) {
      const c = byId.get(cur);
      if (!c) break;
      parts.unshift(c.title);
      cur = c.parentId;
    }
    return parts.join(" > ");
  };

  const csv = toCsv(
    ["מזהה", "זמן", "מזהה משתמשת", "שם", "מייל", "מספר אישי", "מזהה חומר", "חומר", "סוג", "קטגוריה", "דרך", "סימן מים", "IP", "דפדפן"],
    rows.map((r) => [
      r.id,
      r.createdAt.toISOString(),
      r.userId,
      r.userName,
      r.userEmail,
      r.personalCode,
      r.materialId,
      r.materialTitle,
      MATERIAL_KINDS[r.kind]?.label ?? r.kind,
      pathOf(r.categoryId),
      r.via,
      r.watermark,
      r.ip,
      shortUA(r.userAgent),
    ]),
  );
  return csvResponse(`downloads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
