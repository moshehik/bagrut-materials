"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { sellOffers } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { adminEmail, sendMailInBackground, templates } from "@/lib/mail";
import { logAudit } from "@/lib/audit";

export type SellState = { error?: string; ok?: boolean } | undefined;

const schema = z.object({
  subject: z.string().trim().min(2, "בחרי או כתבי מקצוע").max(120),
  title: z.string().trim().min(3, "כותרת קצרה מדי").max(200, "כותרת ארוכה מדי"),
  description: z.string().trim().min(10, "תארי את החומר בכמה משפטים").max(5000, "התיאור ארוך מדי"),
  askingPrice: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0, "מחיר לא תקין").max(100000, "מחיר לא תקין").optional(),
  ),
  fileUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().url("קישור לא תקין (למשל קישור ל-Drive)").max(2000).optional(),
  ),
});

/** יצירת הצעת מכירה – נשלחת למנהלת האתר לבדיקה */
export async function createSellOffer(_prev: SellState, form: FormData): Promise<SellState> {
  const user = await getCurrentUser();
  if (!user) {
    await logAudit({ action: "sell_offer.denied", entityType: "sell_offer", details: { reason: "login_required" } });
    return { error: "יש להתחבר כדי להציע חומרים" };
  }

  const parsed = schema.safeParse({
    subject: form.get("subject"),
    title: form.get("title"),
    description: form.get("description"),
    askingPrice: form.get("askingPrice") ?? "",
    fileUrl: form.get("fileUrl") ?? "",
  });
  if (!parsed.success) {
    await logAudit({
      actorId: user.id,
      action: "sell_offer.denied",
      entityType: "sell_offer",
      details: { reason: "validation", message: parsed.error.issues[0].message },
    });
    return { error: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  const [created] = await db
    .insert(sellOffers)
    .values({
    userId: user.id,
    subject: d.subject,
    title: d.title,
    description: d.description,
    // המחיר מוזן בשקלים ונשמר באגורות
    askingPrice: d.askingPrice !== undefined ? Math.round(d.askingPrice * 100) : null,
    fileUrl: d.fileUrl ?? null,
    status: "pending",
  })
    .returning({ id: sellOffers.id });
  await logAudit({
    actorId: user.id,
    action: "sell_offer.create",
    entityType: "sell_offer",
    entityId: created?.id ?? null,
    details: { subject: d.subject, title: d.title, hasFile: !!d.fileUrl },
  });

  const priceAgorot = d.askingPrice !== undefined ? Math.round(d.askingPrice * 100) : null;
  sendMailInBackground({ to: user.email, ...templates.sellOfferUser(user.name, d.title), kind: "sell_offer", userId: user.id });
  const admin = adminEmail();
  if (admin) {
    sendMailInBackground({
      to: admin,
      ...templates.sellOfferAdmin(user.name, user.email, d.subject, d.title, d.description + (d.fileUrl ? `\n\nקישור: ${d.fileUrl}` : ""), priceAgorot),
      kind: "sell_offer",
      userId: user.id,
    });
  }

  revalidatePath("/sell");
  return { ok: true };
}
