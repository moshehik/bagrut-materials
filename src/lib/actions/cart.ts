"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, categories, materials, purchases, transactions, users, type Plan, type Tier } from "@/db/schema";
import { PLANS, TIERS, formatPrice } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";
import { sendMailInBackground, templates } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { getBool } from "@/lib/settings";
import { cartCount, getCart } from "@/lib/cart";

/*
 * TODO(payments): כמו ב-purchase.ts – התשלום מדומה (mock). ה-checkout של העגלה רושם
 * את הרכישות מיידית עם paymentRef = MOCK-CART-<timestamp>.
 * בחיבור ספק סליקה (Cardcom / Meshulam / PayPlus): ליצור הזמנה ממתינה מסך העגלה,
 * להפנות לדף התשלום של הספק, ורק ב-callback מאומת להכניס את שורות ה-purchases/transactions
 * ולרוקן את העגלה.
 */

const idNum = z.coerce.number().int().positive();

const addSchema = z
  .object({
    materialId: idNum.optional(),
    categoryId: idNum.optional(),
    plan: z.enum(["subject_monthly", "custom_monthly", "yearly"]).optional(),
    premium: z.boolean().optional(),
  })
  .refine((d) => d.materialId || d.categoryId || d.plan, { message: "פריט לא תקין" });

export type AddToCartInput = z.input<typeof addSchema>;
export type CartActionResult =
  | { ok: true; count: number; existed?: boolean }
  | { ok: false; error: string };

/** הוספה לעגלה – ללא כפילויות (אותו חומר / תיקייה / מסלול). דורש התחברות: {ok:false,error:"login"} */
export async function addToCart(input: AddToCartInput): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "login" };
  if (!(await getBool("cart_enabled"))) return { ok: false, error: "העגלה אינה פעילה כרגע" };

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "פריט לא תקין" };
  const d = parsed.data;

  // סוג הפריט: חומר בודד / תיקייה (bundle) / מסלול (plan; מנוי מקצוע דורש categoryId)
  let values: typeof cartItems.$inferInsert;
  if (d.plan) {
    if (d.plan === "subject_monthly" && !d.categoryId) return { ok: false, error: "יש לבחור מקצוע" };
    values = {
      userId: user.id,
      plan: d.plan,
      categoryId: d.plan === "subject_monthly" ? d.categoryId! : null,
      materialId: null,
      premium: !!d.premium,
    };
  } else if (d.materialId) {
    const [m] = await db
      .select({ id: materials.id })
      .from(materials)
      .where(eq(materials.id, d.materialId))
      .limit(1);
    if (!m) return { ok: false, error: "החומר לא נמצא" };
    values = { userId: user.id, plan: "single", materialId: m.id, categoryId: null, premium: false };
  } else {
    const [c] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, d.categoryId!))
      .limit(1);
    if (!c) return { ok: false, error: "התיקייה לא נמצאה" };
    values = { userId: user.id, plan: "bundle", categoryId: c.id, materialId: null, premium: false };
  }

  // dedupe
  const existing = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(
      and(
        eq(cartItems.userId, user.id),
        values.materialId ? eq(cartItems.materialId, values.materialId) : isNull(cartItems.materialId),
        values.categoryId ? eq(cartItems.categoryId, values.categoryId) : isNull(cartItems.categoryId),
        eq(cartItems.plan, values.plan!),
      ),
    )
    .limit(1);
  if (existing.length) return { ok: true, count: await cartCount(user.id), existed: true };

  await db.insert(cartItems).values(values);
  revalidatePath("/cart");
  return { ok: true, count: await cartCount(user.id) };
}

export async function removeFromCart(id: number): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "login" };
  await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, user.id)));
  revalidatePath("/cart");
  return { ok: true, count: await cartCount(user.id) };
}

export async function clearCart(): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "login" };
  await db.delete(cartItems).where(eq(cartItems.userId, user.id));
  revalidatePath("/cart");
  return { ok: true, count: 0 };
}

/** עדכון תוסף פרימיום לפריט מסלול בעגלה */
export async function setCartItemPremium(id: number, premium: boolean): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "login" };
  await db
    .update(cartItems)
    .set({ premium })
    .where(and(eq(cartItems.id, id), eq(cartItems.userId, user.id)));
  revalidatePath("/cart");
  return { ok: true, count: await cartCount(user.id) };
}

/* ---------- checkout ---------- */

export type CheckoutCartState = { error?: string } | undefined;

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** מדרג הפרימיום לפי המסלול (כמו ב-purchase.ts) */
function premiumTierFor(plan: Plan): Tier {
  if (plan === "yearly") return "gold";
  if (plan === "custom_monthly") return "silver";
  if (plan === "subject_monthly") return "copper";
  return "iron";
}

async function raiseTier(userId: number, current: Tier, target: Tier) {
  if (TIERS[target].order <= TIERS[current].order) return;
  await db.update(users).set({ tier: target }).where(eq(users.id, userId));
}

/** רכישה (מדומה) של כל פריטי העגלה */
export async function checkoutCart(_prev: CheckoutCartState, _form: FormData): Promise<CheckoutCartState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/cart");
  if (user.suspended) return { error: "החשבון מושהה. פני למנהלת האתר." };

  const cart = await getCart(user.id);
  if (!cart.items.length) return { error: "העגלה ריקה" };

  const paymentRef = `MOCK-CART-${Date.now()}`;
  type Row = typeof purchases.$inferInsert;
  const rows: Row[] = [];
  let tierTarget: Tier | null = null;

  for (const it of cart.items) {
    if (it.kind === "single") {
      rows.push({
        userId: user.id,
        plan: "single",
        materialId: it.materialId,
        categoryId: it.categoryId,
        amount: it.price,
        downloadsLimit: null,
        endsAt: null,
        premium: false,
        paymentRef,
      });
    } else if (it.kind === "bundle") {
      if (it.price <= 0) return { error: `אין חומרים לרכישה בתיקייה "${it.title}"` };
      rows.push({
        userId: user.id,
        plan: "bundle",
        categoryId: it.categoryId,
        amount: it.price,
        downloadsLimit: null,
        endsAt: null,
        premium: false,
        paymentRef,
      });
    } else {
      const def = PLANS[it.plan];
      const days = def.days ?? 30;
      if (it.plan === "subject_monthly" && !it.categoryId) return { error: "מנוי למקצוע דורש בחירת מקצוע" };
      rows.push({
        userId: user.id,
        plan: it.plan,
        categoryId: it.plan === "yearly" ? null : it.categoryId,
        amount: it.price,
        downloadsLimit: def.downloadsLimit ?? null,
        endsAt: addDays(days),
        premium: it.premium,
        paymentRef,
      });
      if (it.premium) {
        const t = premiumTierFor(it.plan);
        if (!tierTarget || TIERS[t].order > TIERS[tierTarget].order) tierTarget = t;
      }
    }
  }

  if (!rows.length) return { error: "לא נוצרה הזמנה" };
  const inserted = await db.insert(purchases).values(rows).returning({ id: purchases.id });
  await db.insert(transactions).values({
    userId: user.id,
    purchaseId: inserted[0]?.id ?? null,
    type: "charge",
    amount: cart.total,
    method: "mock",
    reference: paymentRef,
    note: `עגלה: ${cart.items.length} פריטים`,
  });
  if (tierTarget) await raiseTier(user.id, user.tier, tierTarget);

  await db.delete(cartItems).where(eq(cartItems.userId, user.id));

  const description =
    cart.items.length === 1
      ? cart.items[0].title
      : `${cart.items.length} פריטים: ` + cart.items.map((i) => i.title).join(", ");
  const firstEnds = rows.find((r) => r.endsAt)?.endsAt ?? null;
  const t = templates.purchase(user.name, description, formatPrice(cart.total), firstEnds);
  sendMailInBackground({ to: user.email, ...t, kind: "purchase", userId: user.id });

  await logAudit({
    actorId: user.id,
    action: "cart.checkout",
    entityType: "purchase",
    entityId: inserted[0]?.id ?? null,
    details: { paymentRef, total: cart.total, items: cart.items.length },
  });

  revalidatePath("/cart");
  redirect("/account?purchased=1");
}
