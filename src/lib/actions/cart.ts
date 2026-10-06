"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, categories, materials, purchases, transactions } from "@/db/schema";
import { RETIRED_PLAN_MESSAGE, formatPrice } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";
import { sendMailInBackground, templates } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { getBool } from "@/lib/settings";
import { getPlanPrices } from "@/lib/pricing";
import { planAmountFor, termFields } from "@/lib/purchase-helpers";
import { cartCount, getCart } from "@/lib/cart";

/*
 * TODO(payments): כמו ב-purchase.ts – התשלום מדומה (mock). ה-checkout של העגלה רושם
 * את הרכישות מיידית עם paymentRef = MOCK-CART-<timestamp>.
 * בחיבור ספק סליקה (Cardcom / Meshulam / PayPlus): ליצור הזמנה ממתינה מסך העגלה,
 * להפנות לדף התשלום של הספק, ורק ב-callback מאומת להכניס את שורות ה-purchases/transactions
 * ולרוקן את העגלה.
 */

const idNum = z.coerce.number().int().positive();

// המסלול היחיד שנכנס לעגלה הוא השנתי; המסלולים החודשיים הישנים הוסרו מהמכירה (RETIRED_PLANS)
const addSchema = z
  .object({
    materialId: idNum.optional(),
    categoryId: idNum.optional(),
    plan: z.enum(["yearly"]).optional(),
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

  // סוג הפריט: חומר בודד / תיקייה (bundle) / מסלול (plan – שנתי בלבד)
  let values: typeof cartItems.$inferInsert;
  if (d.plan) {
    values = {
      userId: user.id,
      plan: d.plan,
      // שנתי: בלי מקצועות בעגלה – נרשם בקופה כ"ממתין לבחירה" (subjectsPending), כמו "דלג" ב-/checkout
      categoryId: null,
      materialId: null,
    };
  } else if (d.materialId) {
    const [m] = await db
      .select({ id: materials.id, status: materials.status })
      .from(materials)
      .where(eq(materials.id, d.materialId))
      .limit(1);
    if (!m) return { ok: false, error: "החומר לא נמצא" };
    if (m.status !== "active") return { ok: false, error: "החומר מושהה זמנית ואינו זמין לרכישה" };
    values = { userId: user.id, plan: "single", materialId: m.id, categoryId: null };
  } else {
    const [c] = await db
      .select({ id: categories.id, status: categories.status })
      .from(categories)
      .where(eq(categories.id, d.categoryId!))
      .limit(1);
    if (!c) return { ok: false, error: "התיקייה לא נמצאה" };
    if (c.status !== "active") return { ok: false, error: "התיקייה מושהית זמנית ואינה זמינה לרכישה" };
    values = { userId: user.id, plan: "bundle", categoryId: c.id, materialId: null };
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
  await logAudit({
    actorId: user.id,
    action: "cart.add",
    entityType: "cart",
    details: {
      plan: values.plan,
      materialId: values.materialId ?? null,
      categoryId: values.categoryId ?? null,
    },
  });
  revalidatePath("/cart");
  return { ok: true, count: await cartCount(user.id) };
}

export async function removeFromCart(id: number): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "login" };
  await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, user.id)));
  await logAudit({ actorId: user.id, action: "cart.remove", entityType: "cart", details: { cartItemId: id } });
  revalidatePath("/cart");
  return { ok: true, count: await cartCount(user.id) };
}

export async function clearCart(): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "login" };
  await db.delete(cartItems).where(eq(cartItems.userId, user.id));
  await logAudit({ actorId: user.id, action: "cart.clear", entityType: "cart" });
  revalidatePath("/cart");
  return { ok: true, count: 0 };
}

/* ---------- checkout ---------- */

export type CheckoutCartState = { error?: string } | undefined;

/** רכישה (מדומה) של כל פריטי העגלה – אותם מחירים ואותן בדיקות כמו purchaseAction */
export async function checkoutCart(_prev: CheckoutCartState, _form: FormData): Promise<CheckoutCartState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/cart");
  // תיעוד סירוב בקופת העגלה – מחזיר את הודעת השגיאה כרגיל (לא משנה התנהגות)
  const denied = async (reason: string, error: string, extra?: Record<string, unknown>): Promise<CheckoutCartState> => {
    await logAudit({ actorId: user.id, action: "cart.checkout_denied", entityType: "cart", details: { reason, ...extra } });
    return { error };
  };
  if (user.suspended) return denied("user_suspended", "החשבון מושהה. פני למנהלת האתר.");
  // כמו שאר ממשק העגלה: כשהעגלה כבויה בהגדרות אין גם קופה
  if (!(await getBool("cart_enabled"))) {
    return denied("cart_disabled", "העגלה אינה פעילה כרגע. אפשר לרכוש כל פריט בנפרד מדף החומר.");
  }

  const cart = await getCart(user.id);
  if (!cart.items.length) return denied("empty_cart", "העגלה ריקה");

  const prices = await getPlanPrices();
  const paymentRef = `MOCK-CART-${Date.now()}`;
  type Row = typeof purchases.$inferInsert;
  const rows: Row[] = [];

  for (const it of cart.items) {
    if (it.kind === "single") {
      // נבדק גם בהוספה – אבל החומר יכול היה להיות מושהה מאז
      const [m] = await db
        .select({ id: materials.id, status: materials.status })
        .from(materials)
        .where(eq(materials.id, it.materialId!))
        .limit(1);
      if (!m || m.status !== "active") {
        return denied("material_inactive", `החומר "${it.title}" מושהה זמנית ואינו זמין לרכישה – הסירי אותו מהעגלה`, {
          materialId: it.materialId,
        });
      }
      rows.push({
        userId: user.id,
        plan: "single",
        materialId: it.materialId,
        categoryId: it.categoryId,
        amount: it.price,
        downloadsLimit: null,
        endsAt: null,
        paymentRef,
      });
    } else if (it.kind === "bundle") {
      const [c] = await db
        .select({ id: categories.id, status: categories.status })
        .from(categories)
        .where(eq(categories.id, it.categoryId!))
        .limit(1);
      if (!c || c.status !== "active") {
        return denied("folder_inactive", `התיקייה "${it.title}" מושהית זמנית ואינה זמינה לרכישה – הסירי אותה מהעגלה`, {
          categoryId: it.categoryId,
        });
      }
      if (it.price <= 0) {
        return denied("empty_folder", `אין חומרים לרכישה בתיקייה "${it.title}"`, { categoryId: it.categoryId });
      }
      rows.push({
        userId: user.id,
        plan: "bundle",
        categoryId: it.categoryId,
        amount: it.price,
        downloadsLimit: null,
        endsAt: null,
        paymentRef,
      });
    } else if (it.retired || it.plan !== "yearly") {
      // פריט ישן בעגלה ממסלול שכבר לא נמכר (subject_monthly / custom_monthly) – מסרבים, והמורה מסירה אותו
      return denied("plan_retired", `${RETIRED_PLAN_MESSAGE} – הסירי את "${it.title}" מהעגלה`, {
        cartItemId: it.id,
        plan: it.plan,
      });
    } else {
      // שנתי: בלי מקצועות בעגלה – שורה אחת "ממתינה" (אין גישה עד הבחירה ב-/account/subjects),
      // בדיוק כמו "דלג" ב-purchaseAction. categoryId ריק בלי subjectsPending = גישה לכל המקצועות!
      const amount = planAmountFor("yearly", prices);
      rows.push({
        userId: user.id,
        plan: "yearly",
        categoryId: null,
        subjectsPending: true,
        amount: amount.total,
        downloadsLimit: amount.downloadsLimit,
        ...termFields("yearly", amount.days),
        paymentRef,
      });
    }
  }

  if (!rows.length) return denied("no_rows", "לא נוצרה הזמנה");
  const inserted = await db.insert(purchases).values(rows).returning({ id: purchases.id });
  try {
    await db.insert(transactions).values({
      userId: user.id,
      purchaseId: inserted[0]?.id ?? null,
      type: "charge",
      amount: cart.total,
      method: "mock",
      reference: paymentRef,
      note: `עגלה: ${cart.items.length} פריטים`,
    });
  } catch (e) {
    console.error("[cart] transaction insert failed", e);
    await logAudit({
      actorId: user.id,
      action: "purchase.tx_failed",
      entityType: "purchase",
      entityId: inserted[0]?.id ?? null,
      details: { purchaseId: inserted[0]?.id ?? null, error: e instanceof Error ? `${e.name}: ${e.message.slice(0, 160).replace(/\s+/g, " ")}` : "unknown" },
    });
  }

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
