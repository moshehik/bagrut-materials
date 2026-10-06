"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { purchases, transactions } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { PLANS, formatPrice } from "@/lib/constants";
import { getPlanPrices } from "@/lib/pricing";
import { addDays } from "@/lib/purchase-helpers";
import { sendMailInBackground, templates } from "@/lib/mail";
import { loadUpgradeOffers } from "@/lib/upgrade";

/*
 * שדרוג ממלאת מקום (3 חודשים / יומית) למנוי שנתי: משלמים את מחיר המנוי השנתי פחות מה ששולם על התוכנית.
 *  - ממלאת מקום 3 חודשים: שנה מההורדה הראשונה בתוכנית. עוד לא הורידה – השנה מתחילה בהורדה הראשונה (כמו כל מנוי).
 *  - ממלאת מקום יומית (בלי תוקף בזמן): השנה מתחילה ברגע השדרוג, והמקצועות נבחרים אחר כך ב-/account/subjects.
 * שורות התוכנית הישנה נסגרות (status = expired); הסכום ששולם נשאר רשום עליהן, ושורת השנתי נושאת רק את ההפרש.
 */

const YEAR_DAYS = 365;

export async function upgradeToYearlyAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/upgrade");

  const back = (msg: string) => redirect(`/account/upgrade?msg=${encodeURIComponent(msg)}`);
  const deny = async (reason: string, msg: string, extra?: Record<string, unknown>) => {
    await logAudit({
      actorId: user.id,
      action: "purchase.upgrade_denied",
      entityType: "purchase",
      details: { reason, ...extra },
    });
    return back(msg);
  };
  if (user.suspended) return deny("user_suspended", "החשבון מושהה – לא ניתן לבצע רכישות");

  const purchaseId = z.coerce.number().int().positive().safeParse(form.get("purchaseId"));
  if (!purchaseId.success) return deny("invalid_input", "נתונים לא תקינים");

  const prices = await getPlanPrices();
  const offers = await loadUpgradeOffers(user.id, prices.plans.yearly);
  const offer = offers.find((o) => o.rows.some((r) => r.id === purchaseId.data));
  if (!offer) return deny("no_offer", "לא נמצאה תוכנית פעילה לשדרוג", { purchaseId: purchaseId.data });

  const now = new Date();
  const oldIds = offer.rows.map((r) => r.id);

  // סגירת התוכנית הישנה – מותנה בכך שעדיין פעילה (שתי לחיצות במקביל לא ישדרגו פעמיים)
  const closed = await db
    .update(purchases)
    .set({ status: "expired", notes: "שודרג למנוי שנתי" })
    .where(
      and(
        eq(purchases.userId, user.id),
        eq(purchases.status, "active"),
        or(isNull(purchases.endsAt), gt(purchases.endsAt, now)),
        or(...oldIds.map((id) => eq(purchases.id, id)))!,
      ),
    )
    .returning({ id: purchases.id });
  if (closed.length !== oldIds.length) {
    // חלק מהשורות כבר נסגרו – מחזירים את מה שנסגר עכשיו
    for (const c of closed) {
      await db.update(purchases).set({ status: "active", notes: null }).where(eq(purchases.id, c.id));
    }
    return deny("already_upgraded", "התוכנית הזו כבר שודרגה או שפג תוקפה", { purchaseId: purchaseId.data });
  }

  const paymentRef = `MOCK-UPG-${Date.now()}`;
  const yearly = PLANS.yearly;
  type Row = typeof purchases.$inferInsert;
  const rows: Row[] = [];

  if (offer.kind === "daily") {
    // אין תוקף בזמן – השנה מתחילה עכשיו, והמקצועות ייבחרו אחר כך
    rows.push({
      userId: user.id,
      plan: "yearly",
      categoryId: null,
      subjectsPending: true,
      amount: offer.diff,
      downloadsLimit: yearly.downloadsLimit ?? null,
      endsAt: addDays(YEAR_DAYS),
      paymentRef,
    });
  } else {
    // שנה מההורדה הראשונה בתוכנית; עוד לא הורידה – שנה מההורדה הראשונה במנוי החדש
    const endsAt = offer.activatedAt ? addDays(YEAR_DAYS, offer.activatedAt) : null;
    offer.rows.forEach((r, i) => {
      rows.push({
        userId: user.id,
        plan: "yearly",
        categoryId: r.categoryId,
        amount: i === 0 ? offer.diff : 0,
        downloadsLimit: yearly.downloadsLimit ?? null,
        endsAt,
        termDays: endsAt ? null : YEAR_DAYS,
        paymentRef,
      });
    });
  }

  let inserted: { id: number }[];
  try {
    inserted = await db.insert(purchases).values(rows).returning({ id: purchases.id });
  } catch (e) {
    for (const id of oldIds) {
      await db.update(purchases).set({ status: "active", notes: null }).where(eq(purchases.id, id));
    }
    throw e;
  }

  if (offer.diff > 0) {
    try {
      await db.insert(transactions).values({
        userId: user.id,
        purchaseId: inserted[0]?.id ?? null,
        type: "charge",
        amount: offer.diff,
        method: "mock",
        reference: paymentRef,
        note: `שדרוג ל${yearly.label} (הפרש אחרי ${formatPrice(offer.paid)} ששולמו)`,
        createdById: null,
      });
    } catch (e) {
      console.error("[upgrade] transaction insert failed", e);
      await logAudit({
        actorId: user.id,
        action: "purchase.tx_failed",
        entityType: "purchase",
        entityId: inserted[0]?.id ?? null,
        details: { purchaseId: inserted[0]?.id ?? null, error: e instanceof Error ? e.message.slice(0, 160) : "unknown" },
      });
    }
  }
  await logAudit({
    actorId: user.id,
    action: "purchase.upgrade",
    entityType: "purchase",
    entityId: inserted[0]?.id ?? null,
    details: { from: oldIds, kind: offer.kind, paid: offer.paid, diff: offer.diff, paymentRef },
  });

  const t = templates.purchase(user.name, `שדרוג ל${yearly.label}`, formatPrice(offer.diff), rows[0]?.endsAt ?? null);
  sendMailInBackground({ to: user.email, ...t, kind: "purchase", userId: user.id });

  revalidatePath("/account", "layout");
  redirect(offer.kind === "daily" ? "/account/subjects?msg=" + encodeURIComponent("השדרוג בוצע – בחרי עכשיו את המקצוע שלך") : "/account/purchases");
}
