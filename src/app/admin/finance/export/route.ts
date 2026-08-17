import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { transactions, users, txTypeEnum } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  charge: "חיוב",
  refund: "זיכוי",
  manual: "תשלום ידני",
  adjustment: "התאמה",
};

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const type = txTypeEnum.enumValues.find((t) => t === sp.get("type"));
  const userParam = sp.get("user");
  const userId = userParam && Number.isInteger(Number(userParam)) ? Number(userParam) : undefined;
  const from = sp.get("from") ? new Date(sp.get("from")!) : undefined;
  const to = sp.get("to") ? new Date(sp.get("to")!) : undefined;

  const conds: SQL[] = [];
  if (type) conds.push(eq(transactions.type, type));
  if (userId) conds.push(eq(transactions.userId, userId));
  if (from && !Number.isNaN(from.getTime())) conds.push(gte(transactions.createdAt, from));
  if (to && !Number.isNaN(to.getTime())) {
    conds.push(lte(transactions.createdAt, new Date(to.getTime() + 24 * 60 * 60 * 1000)));
  }

  const rows = await db
    .select({
      id: transactions.id,
      createdAt: transactions.createdAt,
      userName: users.name,
      userEmail: users.email,
      purchaseId: transactions.purchaseId,
      type: transactions.type,
      amount: transactions.amount,
      method: transactions.method,
      reference: transactions.reference,
      note: transactions.note,
    })
    .from(transactions)
    .leftJoin(users, eq(users.id, transactions.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(transactions.createdAt))
    .limit(10000);

  const header = ["מזהה", "תאריך", "שם", "מייל", "רכישה", "סוג", "סכום (₪)", "אמצעי", "אסמכתא", "הערה"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt.toISOString(),
        r.userName,
        r.userEmail,
        r.purchaseId,
        TYPE_LABELS[r.type] ?? r.type,
        (r.amount / 100).toFixed(2),
        r.method,
        r.reference,
        r.note,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const BOM = String.fromCharCode(0xfeff);
  const csv = BOM + lines.join("\r\n");

  await logAudit({
    actorId: me.id,
    action: "finance.export",
    entityType: "transaction",
    details: { rows: rows.length, type: type ?? null, userId: userId ?? null },
  });

  const fileName = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
