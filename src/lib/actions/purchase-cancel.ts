"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { purchases, transactions } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { adminEmail, sendMailInBackground, siteUrl } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { formatPrice } from "@/lib/constants";
import { getOrderCancelInfo, orderKey } from "@/lib/purchase-cancel";

/**
 * ביטול עצמי של הזמנה וזיכוי מלא – אפשרי רק כל עוד לא הורדו קבצים מההזמנה.
 * (התשלום עדיין מדומה, ראו TODO ב-purchase.ts; עם סליקה אמיתית יש להוסיף כאן ביטול עסקה אצל הספק.)
 */
export async function cancelOrderAction(form: FormData) {
  const user = await requireUser();
  const purchaseId = Number(form.get("purchaseId"));
  if (!Number.isInteger(purchaseId)) redirect("/account/purchases");

  const [p] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, purchaseId), eq(purchases.userId, user.id), eq(purchases.status, "active")));
  if (!p) redirect("/account/purchases?cancel=gone");

  const info = (await getOrderCancelInfo(user.id)).get(orderKey(p));
  if (!info || !info.eligible) {
    await logAudit({
      actorId: user.id,
      action: "purchase.self_cancel_denied",
      entityType: "purchase",
      entityId: p.id,
      details: { reason: "downloaded" },
    });
    redirect("/account/purchases?cancel=denied");
  }

  // סימון אטומי: רק שורות שעדיין פעילות (אם נלחץ פעמיים – השני לא יזכה שוב)
  const done = await db
    .update(purchases)
    .set({ status: "refunded" })
    .where(and(inArray(purchases.id, info.rowIds), eq(purchases.status, "active")))
    .returning({ id: purchases.id, amount: purchases.amount });
  if (!done.length) redirect("/account/purchases?cancel=gone");

  const refund = done.reduce((s, r) => s + r.amount, 0);
  if (refund > 0) {
    await db.insert(transactions).values({
      userId: user.id,
      purchaseId: p.id,
      type: "refund",
      amount: -refund,
      method: "mock",
      reference: p.paymentRef ?? null,
      note: "ביטול על ידי הלקוחה לפני הורדה – זיכוי מלא",
      createdById: user.id,
    });
  }
  await logAudit({
    actorId: user.id,
    action: "purchase.self_cancel",
    entityType: "purchase",
    entityId: p.id,
    details: { rows: done.map((r) => r.id), refund, paymentRef: p.paymentRef },
  });

  sendMailInBackground({
    to: user.email,
    subject: "ההזמנה בוטלה – זיכוי מלא",
    text: `שלום ${user.name},\n\nההזמנה בוטלה בהתאם לבקשתך, ולא בוצעו בה הורדות. סכום של ${formatPrice(refund)} יוחזר אלייך באותו אמצעי תשלום.\n\nשאלות? אפשר לפנות אלינו: ${siteUrl()}/contact`,
    kind: "manual",
    userId: user.id,
  });
  const admin = adminEmail();
  if (admin) {
    sendMailInBackground({
      to: admin,
      subject: `ביטול הזמנה לפני הורדה – ${user.name}`,
      text: `${user.name} (${user.email}) ביטלה הזמנה (הזמנה ${p.paymentRef ?? `#${p.id}`}) לפני הורדה. נרשם זיכוי של ${formatPrice(refund)}.\nיש להחזיר את הסכום בפועל בספק הסליקה.\n\nלטיפול: ${siteUrl()}/admin/subscriptions?user=${user.id}`,
      kind: "manual",
      userId: user.id,
    });
  }
  redirect("/account/purchases?cancel=done");
}
