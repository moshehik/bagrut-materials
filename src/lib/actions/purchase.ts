"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, purchases, transactions, type Tier } from "@/db/schema";
import { PLANS, formatPrice } from "@/lib/constants";
import { getPlanPrices } from "@/lib/pricing";
import { getCurrentUser } from "@/lib/session";
import { sendMailInBackground, templates } from "@/lib/mail";
import { getDescendantIds } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import { addDays, premiumTierFor, raiseTier } from "@/lib/purchase-helpers";

/*
 * TODO(payments): כרגע אין ספק סליקה מחובר. ה"תשלום" הוא מדומה (mock):
 * ההזמנה נרשמת מיידית עם paymentRef = MOCK-<timestamp>.
 * לחיבור ספק ישראלי (Cardcom / Meshulam / PayPlus):
 *   1. במקום ההכנסה הישירה ל-purchases – ליצור "הזמנה ממתינה" ולהפנות לדף התשלום של הספק
 *      עם סכום, מזהה הזמנה ו-callback URL.
 *   2. להוסיף route handler (למשל /api/payments/callback) שמאמת את החתימה של הספק,
 *      ורק אז מכניס את שורות ה-purchases ומעדכן tier.
 *   3. להחליף את paymentRef במזהה העסקה האמיתי.
 */

const idNum = z.coerce.number().int().positive();

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single"), materialId: idNum }),
  z.object({ kind: z.literal("bundle"), categoryId: idNum }),
  z.object({
    kind: z.literal("plan"),
    plan: z.literal("subject_monthly"),
    categoryId: idNum,
  }),
  z.object({
    kind: z.literal("plan"),
    plan: z.literal("custom_monthly"),
    categoryIds: z.array(idNum).min(1, "בחרי לפחות מקצוע אחד").max(3, "עד 3 מקצועות"),
  }),
  z.object({ kind: z.literal("plan"), plan: z.literal("yearly") }),
  z.object({ kind: z.literal("premium") }),
]);

export type PurchaseState = { error?: string } | undefined;

/** שורת פרימיום בלבד ל-30 יום (ללא זכאות הורדה) */
function premiumOnlyRow(
  userId: number,
  paymentRef: string,
  amount: number,
): typeof purchases.$inferInsert {
  return {
    userId,
    plan: "single",
    materialId: null,
    categoryId: null,
    amount,
    downloadsLimit: 0,
    endsAt: addDays(30),
    premium: true,
    paymentRef,
  };
}

async function assertRootSubject(id: number) {
  const [c] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), isNull(categories.parentId)))
    .limit(1);
  return c ?? null;
}

/** רכישה (מדומה) – מקבלת FormData מדף ה-checkout */
export async function purchaseAction(_prev: PurchaseState, form: FormData): Promise<PurchaseState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout");
  if (user.suspended) return { error: "החשבון מושהה – לא ניתן לבצע רכישות" };

  const raw: Record<string, unknown> = Object.fromEntries(form);
  const ids = form.getAll("categoryIds").map(String).filter(Boolean);
  if (ids.length) raw.categoryIds = ids;
  const premium = form.get("premium") === "on";

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "נתוני הזמנה לא תקינים" };
  const input = parsed.data;

  const prices = await getPlanPrices();
  const paymentRef = `MOCK-${Date.now()}`;
  type Row = typeof purchases.$inferInsert;
  const rows: Row[] = [];
  let tierTarget: Tier | null = null;

  switch (input.kind) {
    case "single": {
      const [m] = await db.select().from(materials).where(eq(materials.id, input.materialId)).limit(1);
      if (!m) return { error: "החומר לא נמצא" };
      if (m.status !== "active") return { error: "החומר מושהה זמנית ואינו זמין לרכישה" };
      rows.push({
        userId: user.id,
        plan: "single",
        materialId: m.id,
        categoryId: m.categoryId,
        amount: m.price,
        downloadsLimit: null,
        endsAt: null,
        premium: false,
        paymentRef,
      });
      // רכישה בודדת אינה פגת-תוקף, לכן תוספת הפרימיום נרשמת כשורה נפרדת ל-30 יום
      if (premium) rows.push(premiumOnlyRow(user.id, paymentRef, prices.premiumAddon));
      break;
    }
    case "bundle": {
      const [c] = await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
      if (!c) return { error: "התיקייה לא נמצאה" };
      if (c.status !== "active") return { error: "התיקייה מושהית זמנית ואינה זמינה לרכישה" };
      let amount = c.bundlePrice ?? 0;
      if (!c.bundlePrice) {
        const ids = await getDescendantIds(c.id);
        const ms = ids.length
          ? await db.select({ price: materials.price }).from(materials).where(inArray(materials.categoryId, ids))
          : [];
        amount = Math.round(ms.reduce((s, x) => s + x.price, 0) * 0.7);
      }
      if (amount <= 0) return { error: "אין חומרים לרכישה בתיקייה זו" };
      rows.push({
        userId: user.id,
        plan: "bundle",
        categoryId: c.id,
        amount,
        downloadsLimit: null,
        endsAt: null,
        premium: false,
        paymentRef,
      });
      if (premium) rows.push(premiumOnlyRow(user.id, paymentRef, prices.premiumAddon));
      break;
    }
    case "plan": {
      const def = PLANS[input.plan];
      const basePrice = prices.plans[input.plan];
      const days = def.days ?? 30;
      const months = Math.max(1, Math.round(days / 30));
      const addon = premium ? prices.premiumAddon * months : 0;
      const endsAt = addDays(days);
      if (input.plan === "subject_monthly") {
        const c = await assertRootSubject(input.categoryId);
        if (!c) return { error: "יש לבחור מקצוע ראשי" };
        rows.push({
          userId: user.id,
          plan: "subject_monthly",
          categoryId: c.id,
          amount: basePrice + addon,
          downloadsLimit: def.downloadsLimit ?? null,
          endsAt,
          premium,
          paymentRef,
        });
      } else if (input.plan === "custom_monthly") {
        const uniq = [...new Set(input.categoryIds)];
        const roots = await db
          .select()
          .from(categories)
          .where(and(inArray(categories.id, uniq), isNull(categories.parentId)));
        if (roots.length !== uniq.length) return { error: "יש לבחור מקצועות ראשיים בלבד" };
        // הסכום הכולל נרשם על השורה הראשונה; שאר השורות ב-0 כדי לא לספור פעמיים
        roots.forEach((c, i) => {
          rows.push({
            userId: user.id,
            plan: "custom_monthly",
            categoryId: c.id,
            amount: i === 0 ? basePrice + addon : 0,
            downloadsLimit: def.downloadsLimit ?? null,
            endsAt,
            premium,
            paymentRef,
          });
        });
      } else {
        rows.push({
          userId: user.id,
          plan: "yearly",
          categoryId: null,
          amount: basePrice + addon,
          downloadsLimit: def.downloadsLimit ?? null,
          endsAt,
          premium,
          paymentRef,
        });
      }
      if (premium) tierTarget = premiumTierFor("plan", input.plan);
      break;
    }
    case "premium": {
      rows.push(premiumOnlyRow(user.id, paymentRef, prices.premiumAddon));
      tierTarget = "iron";
      break;
    }
  }

  if (premium && !tierTarget) tierTarget = premiumTierFor(input.kind);

  if (!rows.length) return { error: "לא נוצרה הזמנה" };
  const inserted = await db.insert(purchases).values(rows).returning({ id: purchases.id });
  if (tierTarget) await raiseTier(user.id, user.tier, tierTarget);

  // רישום תנועה כספית (חיוב) – סכום כולל של ההזמנה
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const description =
    input.kind === "premium"
      ? "מנוי פרימיום חודשי"
      : input.kind === "single"
        ? "הורדה בודדת"
        : input.kind === "bundle"
          ? "קובץ מורחב (תיקייה שלמה)"
          : PLANS[input.plan].label + (premium ? " + פרימיום" : "");
  try {
    await db.insert(transactions).values({
      userId: user.id,
      purchaseId: inserted[0]?.id ?? null,
      type: "charge",
      amount: total,
      method: "mock",
      reference: paymentRef,
      note: description,
      createdById: null,
    });
  } catch (e) {
    console.error("[purchase] transaction insert failed", e);
  }
  await logAudit({
    actorId: user.id,
    action: "purchase.create",
    entityType: "purchase",
    entityId: inserted[0]?.id ?? null,
    details: { kind: input.kind, total, paymentRef, premium },
  });

  // מייל אישור רכישה
  const t = templates.purchase(user.name, description, formatPrice(total), rows[0]?.endsAt ?? null);
  sendMailInBackground({ to: user.email, ...t, kind: "purchase", userId: user.id });

  redirect("/account?purchased=1");
}
