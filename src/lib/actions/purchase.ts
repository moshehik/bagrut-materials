"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, privateCoupons, purchases, transactions, users } from "@/db/schema";
import { citySchema, schoolSchema } from "@/lib/profile-validation";
import { getBestPercentCoupon } from "@/lib/private-coupons";
import { PLANS, RETIRED_PLAN_MESSAGE, YEARLY_INCLUDED_SUBJECTS, bundlePriceFor, formatPrice, isRetiredPlan } from "@/lib/constants";
import { getPlanPrices } from "@/lib/pricing";
import { getCurrentUser } from "@/lib/session";
import { sendMailInBackground, templates } from "@/lib/mail";
import { chainToHref, getCategoryChain, getDescendantIds } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import { termFields } from "@/lib/purchase-helpers";

/*
 * TODO(payments): כרגע אין ספק סליקה מחובר. ה"תשלום" הוא מדומה (mock):
 * ההזמנה נרשמת מיידית עם paymentRef = MOCK-<timestamp>.
 * לחיבור ספק ישראלי (Cardcom / Meshulam / PayPlus):
 *   1. במקום ההכנסה הישירה ל-purchases – ליצור "הזמנה ממתינה" ולהפנות לדף התשלום של הספק
 *      עם סכום, מזהה הזמנה ו-callback URL.
 *   2. להוסיף route handler (למשל /api/payments/callback) שמאמת את החתימה של הספק,
 *      ורק אז מכניס את שורות ה-purchases.
 *   3. להחליף את paymentRef במזהה העסקה האמיתי.
 */

const idNum = z.coerce.number().int().positive();

// המסלולים החודשיים הישנים (subject_monthly / custom_monthly) הוסרו מהמכירה – ר' RETIRED_PLANS; הקופה מסרבת להם למטה
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single"), materialId: idNum }),
  z.object({ kind: z.literal("bundle"), categoryId: idNum }),
  z.object({
    kind: z.literal("plan"),
    plan: z.literal("yearly"),
    categoryIds: z.array(idNum).default([]),
    /** "דלג" – רכישה בלי בחירת מקצועות כעת (נבחרים אחר כך בחשבון) */
    skipSubjects: z.string().optional(),
  }),
  z.object({
    kind: z.literal("plan"),
    plan: z.literal("substitute_3m"),
    // ממלאת מקום 3 חודשים = מקצוע אחד בלבד (אי אפשר להרחיב) – אחרת אפשר לקנות מסלול זול ולהוריד כמה מקצועות
    categoryIds: z.array(idNum).min(1, "בחרי מקצוע").max(1, "ממלאת מקום כוללת מקצוע אחד בלבד"),
  }),
  // ממלאת מקום יומית: סל הורדות לכל המקצועות, בלי בחירת מקצוע ובלי הגבלת זמן
  z.object({ kind: z.literal("plan"), plan: z.literal("substitute_daily") }),
]);

export type PurchaseState = { error?: string } | undefined;

/** רכישה (מדומה) – מקבלת FormData מדף ה-checkout */
export async function purchaseAction(_prev: PurchaseState, form: FormData): Promise<PurchaseState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout");

  const raw: Record<string, unknown> = Object.fromEntries(form);
  // תיעוד סירוב רכישה – מחזיר את הודעת השגיאה כרגיל (לא משנה התנהגות)
  const denied = async (reason: string, error: string, extra?: Record<string, unknown>): Promise<PurchaseState> => {
    await logAudit({
      actorId: user.id,
      action: "purchase.denied",
      details: { reason, kind: typeof raw.kind === "string" ? raw.kind : null, ...extra },
    });
    return { error };
  };
  if (user.suspended) return denied("user_suspended", "החשבון מושהה – לא ניתן לבצע רכישות");

  const ids = form.getAll("categoryIds").map(String).filter(Boolean);
  if (ids.length) raw.categoryIds = ids;

  // מסלול שהוסר מהמכירה – הודעה ברורה במקום שגיאת ולידציה כללית
  if (raw.kind === "plan" && typeof raw.plan === "string" && isRetiredPlan(raw.plan)) {
    return denied("plan_retired", RETIRED_PLAN_MESSAGE, { plan: raw.plan });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return denied("invalid_input", parsed.error.issues[0]?.message ?? "נתוני הזמנה לא תקינים");
  }
  const input = parsed.data;

  // רכישה ראשונה: עיר מגורים ושם תיכון (לא נשאלים בהרשמה)
  let location: { city: string; school: string } | null = null;
  if (!user.city || !user.school) {
    const loc = z.object({ city: citySchema, school: schoolSchema }).safeParse(Object.fromEntries(form));
    if (!loc.success) return denied("invalid_location", loc.error.issues[0]?.message ?? "יש להשלים עיר ותיכון");
    location = loc.data;
  }

  const prices = await getPlanPrices();
  const paymentRef = `MOCK-${Date.now()}`;
  type Row = typeof purchases.$inferInsert;
  const rows: Row[] = [];
  let bundleCategoryId: number | null = null;

  switch (input.kind) {
    case "single": {
      const [m] = await db.select().from(materials).where(eq(materials.id, input.materialId)).limit(1);
      if (!m) return denied("material_not_found", "החומר לא נמצא", { materialId: input.materialId });
      if (m.status !== "active") {
        return denied("material_inactive", "החומר מושהה זמנית ואינו זמין לרכישה", { materialId: m.id });
      }
      rows.push({
        userId: user.id,
        plan: "single",
        materialId: m.id,
        categoryId: m.categoryId,
        amount: m.price,
        downloadsLimit: null,
        endsAt: null,
        paymentRef,
      });
      break;
    }
    case "bundle": {
      const [c] = await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
      if (!c) return denied("folder_not_found", "התיקייה לא נמצאה", { categoryId: input.categoryId });
      if (c.status !== "active") {
        return denied("folder_inactive", "התיקייה מושהית זמנית ואינה זמינה לרכישה", { categoryId: c.id });
      }
      const ids = await getDescendantIds(c.id);
      const ms = ids.length
        ? await db.select({ price: materials.price }).from(materials).where(inArray(materials.categoryId, ids))
        : [];
      const amount = bundlePriceFor({
        bundlePrice: c.bundlePrice,
        isLeaf: ids.length <= 1,
        materialsTotal: ms.reduce((s, x) => s + x.price, 0),
      });
      bundleCategoryId = c.id;
      if (amount <= 0) return denied("empty_folder", "אין חומרים לרכישה בתיקייה זו", { categoryId: c.id });
      rows.push({
        userId: user.id,
        plan: "bundle",
        categoryId: c.id,
        amount,
        downloadsLimit: null,
        endsAt: null,
        paymentRef,
      });
      break;
    }
    case "plan": {
      const def = PLANS[input.plan];
      const basePrice = prices.plans[input.plan];
      const days = def.days ?? 30;
      // מנוי: התוקף מתחיל בהורדה הראשונה (endsAt ריק + termDays). ממלאת מקום יומית – בלי תוקף כלל
      const term =
        input.plan === "substitute_daily" ? { endsAt: null, termDays: null } : termFields(input.plan, days);
      if (input.plan === "substitute_daily") {
        rows.push({
          userId: user.id,
          plan: "substitute_daily",
          categoryId: null, // ריק (ובלי "ממתין") = גישה לכל המקצועות, עד מכסת ההורדות
          amount: basePrice,
          downloadsLimit: prices.substituteDailyDownloads,
          ...term,
          paymentRef,
        });
      } else if (input.plan === "yearly" && input.skipSubjects) {
        // בלי מקצועות כרגע: שורה אחת "ממתינה" שהופכת ל-1 עד 3 מקצועות ב-/account/subjects
        rows.push({
          userId: user.id,
          plan: "yearly",
          categoryId: null,
          subjectsPending: true,
          amount: basePrice,
          downloadsLimit: def.downloadsLimit ?? null,
          ...term,
          paymentRef,
        });
      } else {
        // yearly / substitute_3m: שורה לכל מקצוע שנבחר (מקצוע אחד ומעלה; עד YEARLY_INCLUDED_SUBJECTS באותו מחיר)
        const uniq = [...new Set(input.categoryIds)];
        if (input.plan === "yearly" && uniq.length < 1) {
          return denied("yearly_no_subjects", "יש לבחור לפחות מקצוע אחד", { plan: input.plan });
        }
        // מנוי שנתי: עד 3 מקצועות באותו מחיר, בלי תוספת
        if (input.plan === "yearly" && uniq.length > YEARLY_INCLUDED_SUBJECTS) {
          return denied("yearly_too_many_subjects", `המנוי כולל עד ${YEARLY_INCLUDED_SUBJECTS} מקצועות`, {
            plan: input.plan,
            selected: uniq.length,
          });
        }
        const roots = await db
          .select()
          .from(categories)
          .where(and(inArray(categories.id, uniq), isNull(categories.parentId)));
        if (roots.length !== uniq.length) {
          return denied("not_root_subject", "יש לבחור מקצועות ראשיים בלבד", { plan: input.plan, categoryIds: uniq });
        }
        // הסכום הכולל נרשם על השורה הראשונה; שאר השורות ב-0 כדי לא לספור פעמיים
        roots.forEach((c, i) => {
          rows.push({
            userId: user.id,
            plan: input.plan,
            categoryId: c.id,
            amount: i === 0 ? basePrice : 0,
            downloadsLimit: def.downloadsLimit ?? null,
            ...term,
            paymentRef,
          });
        });
      }
      break;
    }
  }

  if (!rows.length) return denied("no_rows", "לא נוצרה הזמנה");

  // קופון הנחה פרטי (חד-פעמי): תפיסה אטומית לפני הרישום, ושחרור אם הרישום נכשל
  let usedCoupon: { id: number; percent: number } | null = null;
  const pctCoupon = await getBestPercentCoupon(user);
  if (pctCoupon && pctCoupon.percent) {
    const got = await db
      .update(privateCoupons)
      .set({ status: "used", usedAt: new Date(), claimedBy: user.id })
      .where(and(eq(privateCoupons.id, pctCoupon.id), eq(privateCoupons.status, "active")))
      .returning({ id: privateCoupons.id });
    if (got.length) {
      usedCoupon = { id: pctCoupon.id, percent: pctCoupon.percent };
      for (const r of rows) r.amount = Math.round(((r.amount ?? 0) * (100 - pctCoupon.percent)) / 100);
    }
  }
  let inserted: { id: number }[];
  try {
    if (location) {
      await db.update(users).set(location).where(eq(users.id, user.id));
      await logAudit({ actorId: user.id, action: "profile.complete", entityType: "user", entityId: user.id, details: location });
    }
    inserted = await db.insert(purchases).values(rows).returning({ id: purchases.id });
  } catch (e) {
    if (usedCoupon) {
      await db.update(privateCoupons).set({ status: "active", usedAt: null }).where(eq(privateCoupons.id, usedCoupon.id));
    }
    throw e;
  }

  // רישום תנועה כספית (חיוב) – סכום כולל של ההזמנה
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const description =
    input.kind === "single"
      ? "הורדה בודדת"
      : input.kind === "bundle"
        ? "קובץ מורחב (תיקייה שלמה)"
        : PLANS[input.plan].label;
  try {
    await db.insert(transactions).values({
      userId: user.id,
      purchaseId: inserted[0]?.id ?? null,
      type: "charge",
      amount: total,
      method: "mock",
      reference: paymentRef,
      note: usedCoupon ? `${description} (קופון ${usedCoupon.percent}% הנחה)` : description,
      createdById: null,
    });
  } catch (e) {
    console.error("[purchase] transaction insert failed", e);
    await logAudit({
      actorId: user.id,
      action: "purchase.tx_failed",
      entityType: "purchase",
      entityId: inserted[0]?.id ?? null,
      details: { purchaseId: inserted[0]?.id ?? null, error: e instanceof Error ? `${e.name}: ${e.message.slice(0, 160).replace(/\s+/g, " ")}` : "unknown" },
    });
  }
  await logAudit({
    actorId: user.id,
    action: "purchase.create",
    entityType: "purchase",
    entityId: inserted[0]?.id ?? null,
    details: {
      kind: input.kind,
      total,
      paymentRef,
      categoryId: bundleCategoryId ?? ("categoryId" in input ? input.categoryId : null),
      categoryIds: "categoryIds" in input ? input.categoryIds : undefined,
      materialId: input.kind === "single" ? input.materialId : null,
      coupon: usedCoupon,
    },
  });

  // מייל אישור רכישה
  const t = templates.purchase(user.name, description, formatPrice(total), rows[0]?.endsAt ?? null);
  sendMailInBackground({ to: user.email, ...t, kind: "purchase", userId: user.id });

  // רכישת תיקייה: חוזרים אליה ומורידים את כל הקבצים אוטומטית
  if (bundleCategoryId) {
    const chain = await getCategoryChain(bundleCategoryId);
    redirect(`${chainToHref(chain)}?dlall=1`);
  }
  redirect("/account?purchased=1");
}
