"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull, or, sql, gt } from "drizzle-orm";
import { db } from "@/db";
import { categories, privateCoupons, purchases } from "@/db/schema";
import { requireAdmin, getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { PLANS } from "@/lib/constants";
import { addDays } from "@/lib/purchase-helpers";
import { generateCouponCode, getActiveCouponsFor, normalizeCode, parseSubjectIds } from "@/lib/private-coupons";

export type CouponActionState = { error?: string; ok?: boolean; code?: string } | undefined;

async function admin() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const createSchema = z
  .object({
    email: z.preprocess(emptyToUndef, z.string().trim().toLowerCase().email("כתובת מייל לא תקינה").max(255).optional()),
    label: z.string().trim().min(1, "חסר שם לקופון").max(120),
    benefit: z.enum(["percent", "subjects"]),
    percent: z.preprocess(emptyToUndef, z.coerce.number().int().min(1, "אחוז הנחה בין 1 ל-100").max(100).optional()),
    subjectIds: z.array(z.coerce.number().int().positive()).default([]),
    days: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(400).optional()),
    expiresAt: z.preprocess(emptyToUndef, z.coerce.date().optional()),
    note: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.benefit === "percent" && !v.percent) ctx.addIssue({ code: "custom", message: "חסר אחוז הנחה", path: ["percent"] });
    if (v.benefit === "subjects") {
      if (!v.subjectIds.length) ctx.addIssue({ code: "custom", message: "בחרי לפחות מקצוע אחד", path: ["subjectIds"] });
      if (!v.days) ctx.addIssue({ code: "custom", message: "חסר מספר ימים לגישה", path: ["days"] });
    }
  });

/** מנהלת: יצירת קופון פרטי */
export async function createPrivateCoupon(_prev: CouponActionState, form: FormData): Promise<CouponActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const raw = Object.fromEntries(form) as Record<string, unknown>;
  raw.subjectIds = form.getAll("subjectIds").map(String);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const v = parsed.data;

  let subjectIds: number[] = [];
  if (v.benefit === "subjects") {
    const roots = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, v.subjectIds), isNull(categories.parentId)));
    subjectIds = roots.map((r) => r.id);
    if (!subjectIds.length) return { error: "יש לבחור מקצועות ראשיים" };
  }

  // קוד ייחודי (התנגשות כמעט בלתי אפשרית – ננסה כמה פעמים)
  for (let i = 0; i < 5; i++) {
    const code = generateCouponCode();
    try {
      const [row] = await db
        .insert(privateCoupons)
        .values({
          code,
          email: v.email ?? null,
          label: v.label,
          benefit: v.benefit,
          percent: v.benefit === "percent" ? v.percent! : null,
          subjectIds: v.benefit === "subjects" ? JSON.stringify(subjectIds) : null,
          days: v.benefit === "subjects" ? v.days! : null,
          expiresAt: v.expiresAt ?? null,
          note: v.note ?? null,
        })
        .returning({ id: privateCoupons.id });
      await logAudit({
        actorId: me.id,
        action: "coupon.create",
        entityType: "private_coupon",
        entityId: row.id,
        details: { benefit: v.benefit, email: v.email ?? null },
      });
      revalidatePath("/admin/coupons");
      return { ok: true, code };
    } catch (e) {
      if (i === 4) return { error: e instanceof Error ? e.message : "שגיאה ביצירת הקופון" };
    }
  }
  return { error: "שגיאה ביצירת הקופון" };
}

/** מנהלת: ביטול קופון */
export async function revokePrivateCoupon(form: FormData) {
  const me = await admin();
  if (!me) return;
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  await db
    .update(privateCoupons)
    .set({ status: "revoked" })
    .where(and(eq(privateCoupons.id, id), eq(privateCoupons.status, "active")));
  await logAudit({ actorId: me.id, action: "coupon.revoke", entityType: "private_coupon", entityId: id });
  revalidatePath("/admin/coupons");
}

/** משתמשת: שיוך קופון לעצמה בעזרת קוד (קישור או הקלדה) */
export async function claimCouponAction(_prev: CouponActionState, form: FormData): Promise<CouponActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "יש להתחבר כדי לממש קופון" };
  const code = normalizeCode(String(form.get("code") ?? ""));
  if (!code) return { error: "הקלידי קוד קופון" };
  const [c] = await db.select().from(privateCoupons).where(eq(privateCoupons.code, code)).limit(1);
  // אותה הודעה לקוד שגוי / לא שלך – כדי לא לחשוף אילו קודים קיימים
  const notFound = { error: "הקוד לא נמצא או שאינו תקף" };
  if (!c || c.status !== "active" || (c.expiresAt && c.expiresAt < new Date())) return notFound;
  if (c.email && c.email.toLowerCase() !== user.email.toLowerCase()) return notFound;
  if (c.claimedBy && c.claimedBy !== user.id) return notFound;
  await db.update(privateCoupons).set({ claimedBy: user.id }).where(eq(privateCoupons.id, c.id));
  revalidatePath("/coupons");
  return { ok: true };
}

/** משתמשת: מימוש קופון מקצועות-חינם – יוצר גישה מיידית */
export async function redeemSubjectsCouponAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user || user.suspended) return;
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const mine = (await getActiveCouponsFor(user)).find((c) => c.id === id && c.benefit === "subjects");
  if (!mine) return;
  const subjectIds = parseSubjectIds(mine);
  if (!subjectIds.length || !mine.days) return;

  // תפיסה אטומית – מונעת מימוש כפול
  const claimed = await db
    .update(privateCoupons)
    .set({ status: "used", usedAt: new Date(), claimedBy: user.id })
    .where(
      and(
        eq(privateCoupons.id, id),
        eq(privateCoupons.status, "active"),
        or(isNull(privateCoupons.expiresAt), gt(privateCoupons.expiresAt, sql`now()`)),
      ),
    )
    .returning({ id: privateCoupons.id });
  if (!claimed.length) return;

  try {
    const roots = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, subjectIds), isNull(categories.parentId)));
    if (!roots.length) throw new Error("no subjects");
    const def = PLANS.custom_monthly;
    const endsAt = addDays(mine.days);
    await db.insert(purchases).values(
      roots.map((r) => ({
        userId: user.id,
        plan: "custom_monthly" as const,
        categoryId: r.id,
        amount: 0,
        downloadsLimit: def.downloadsLimit ?? null,
        endsAt,
        premium: false,
        paymentRef: `COUPON-${mine.id}`,
        notes: `קופון פרטי: ${mine.label}`,
      })),
    );
  } catch (e) {
    // לא להשאיר קופון "שמומש" בלי שנוצרה גישה
    await db.update(privateCoupons).set({ status: "active", usedAt: null }).where(eq(privateCoupons.id, id));
    console.error("[coupon] redeem failed", e);
    return;
  }
  await logAudit({
    actorId: user.id,
    action: "coupon.redeem",
    entityType: "private_coupon",
    entityId: id,
    details: { benefit: "subjects", subjectIds, days: mine.days },
  });
  revalidatePath("/coupons");
  revalidatePath("/account");
  revalidatePath("/admin/coupons");
}
