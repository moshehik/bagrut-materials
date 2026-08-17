"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, purchases, users, type Tier, type Plan } from "@/db/schema";
import { PLANS, PREMIUM_ADDON_PRICE, TIERS, formatPrice } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";
import { sendMailInBackground, templates } from "@/lib/mail";
import { getDescendantIds } from "@/lib/data";

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

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** מדרג הפרימיום לפי סוג הרכישה */
function premiumTierFor(kind: string, plan?: Plan): Tier {
  if (kind === "plan" && plan === "yearly") return "gold";
  if (kind === "plan" && plan === "custom_monthly") return "silver";
  if (kind === "plan" && plan === "subject_monthly") return "copper";
  return "iron"; // single / bundle / premium בלבד
}

/** שורת פרימיום בלבד ל-30 יום (ללא זכאות הורדה) */
function premiumOnlyRow(userId: number, paymentRef: string): typeof purchases.$inferInsert {
  return {
    userId,
    plan: "single",
    materialId: null,
    categoryId: null,
    amount: PREMIUM_ADDON_PRICE,
    downloadsLimit: 0,
    endsAt: addDays(30),
    premium: true,
    paymentRef,
  };
}

async function raiseTier(userId: number, current: Tier, target: Tier) {
  if (TIERS[target].order <= TIERS[current].order) return;
  await db.update(users).set({ tier: target }).where(eq(users.id, userId));
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

  const raw: Record<string, unknown> = Object.fromEntries(form);
  const ids = form.getAll("categoryIds").map(String).filter(Boolean);
  if (ids.length) raw.categoryIds = ids;
  const premium = form.get("premium") === "on";

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "נתוני הזמנה לא תקינים" };
  const input = parsed.data;

  const paymentRef = `MOCK-${Date.now()}`;
  type Row = typeof purchases.$inferInsert;
  const rows: Row[] = [];
  let tierTarget: Tier | null = null;

  switch (input.kind) {
    case "single": {
      const [m] = await db.select().from(materials).where(eq(materials.id, input.materialId)).limit(1);
      if (!m) return { error: "החומר לא נמצא" };
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
      if (premium) rows.push(premiumOnlyRow(user.id, paymentRef));
      break;
    }
    case "bundle": {
      const [c] = await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
      if (!c) return { error: "התיקייה לא נמצאה" };
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
      if (premium) rows.push(premiumOnlyRow(user.id, paymentRef));
      break;
    }
    case "plan": {
      const def = PLANS[input.plan];
      const days = def.days ?? 30;
      const months = Math.max(1, Math.round(days / 30));
      const addon = premium ? PREMIUM_ADDON_PRICE * months : 0;
      if (input.plan === "subject_monthly") {
        const c = await assertRootSubject(input.categoryId);
        if (!c) return { error: "יש לבחור מקצוע ראשי" };
        rows.push({
          userId: user.id,
          plan: "subject_monthly",
          categoryId: c.id,
          amount: (def.price ?? 0) + addon,
          downloadsLimit: def.downloadsLimit ?? null,
          endsAt: addDays(days),
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
            amount: i === 0 ? (def.price ?? 0) + addon : 0,
            downloadsLimit: def.downloadsLimit ?? null,
            endsAt: addDays(days),
            premium,
            paymentRef,
          });
        });
      } else {
        rows.push({
          userId: user.id,
          plan: "yearly",
          categoryId: null,
          amount: (def.price ?? 0) + addon,
          downloadsLimit: def.downloadsLimit ?? null,
          endsAt: addDays(days),
          premium,
          paymentRef,
        });
      }
      if (premium) tierTarget = premiumTierFor("plan", input.plan);
      break;
    }
    case "premium": {
      rows.push(premiumOnlyRow(user.id, paymentRef));
      tierTarget = "iron";
      break;
    }
  }

  if (premium && !tierTarget) tierTarget = premiumTierFor(input.kind);

  if (!rows.length) return { error: "לא נוצרה הזמנה" };
  await db.insert(purchases).values(rows);
  if (tierTarget) await raiseTier(user.id, user.tier, tierTarget);

  // מייל אישור רכישה
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const description =
    input.kind === "premium"
      ? "מנוי פרימיום חודשי"
      : input.kind === "single"
        ? "הורדה בודדת"
        : input.kind === "bundle"
          ? "קובץ מורחב (תיקייה שלמה)"
          : PLANS[input.plan].label + (premium ? " + פרימיום" : "");
  const t = templates.purchase(user.name, description, formatPrice(total), rows[0]?.endsAt ?? null);
  sendMailInBackground({ to: user.email, ...t, kind: "purchase", userId: user.id });

  redirect("/account?purchased=1");
}
