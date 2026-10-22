import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/http-utils";
import { limitKey, rateLimit, TOO_MANY_MESSAGE } from "@/lib/rate-limit";
import { requestMeta, logAudit } from "@/lib/audit";
import { getPlanPrices } from "@/lib/pricing";
import { getBestPercentCoupon } from "@/lib/private-coupons";
import { YEARLY_INCLUDED_SUBJECTS } from "@/lib/constants";
import { citySchema, phoneSchema, schoolSchema } from "@/lib/profile-validation";
import { loadNedarimConfig } from "@/lib/nedarim/config";
import { MAX_BODY_BYTES, PAY_KEYS, isPayableItemKind, orderKindOf, sameIntentParams, type PayKey } from "@/lib/nedarim/logic";
import { appendEvent, cancelReplaced, createIntent, findOpenWithCoupon, parseCategoryIds } from "@/lib/nedarim/store";
import { redactNedarim } from "@/lib/nedarim/secrets";
import { hostedUrlFor } from "@/lib/nedarim/hosted";
import { itemCoverageFor, loadPayableItem, successHrefFor } from "@/lib/nedarim/items";
import { hasActiveSamePlan } from "@/lib/purchase-helpers";

/*
 * POST /api/pay/intent – עמוד התשלום (/pay, מחוברות בלבד): יוצר בקשת תשלום 'pending' עם מזהה ייחודי (NP-…) ומחזיר את הקישור
 * לדף התשלום המתארח של נדרים פלוס (סכום נעול, פרטי המורה ממולאים, מזהה הבקשה בהערה). הסכום נקבע כאן – מסלול מנוי: מההגדרות
 * (getPlanPrices); הורדה בודדת: materials.price; קובץ מורחב: bundleAmountFor – ומהקופון של המשתמשת; לעולם לא מהדפדפן, ואי אפשר
 * לשנות אותו אחרי היצירה. מספר הכרטיס לא מגיע לכאן אף פעם. docs/nedarim-payments.md
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const idNum = z.number().int().positive();
const bodySchema = z.object({
  /** מסלול מנוי (yearly / substitute_3m / substitute_daily) או פריט (single / bundle) */
  plan: z.enum(PAY_KEYS),
  categoryIds: z.array(idNum).max(YEARLY_INCLUDED_SUBJECTS).default([]),
  skipSubjects: z.boolean().optional(),
  /** הורדה בודדת: החומר */
  materialId: idNum.optional(),
  /** קובץ מורחב: התיקייה */
  categoryId: idNum.optional(),
  /** פרטי פרופיל חסרים (טלפון / עיר / תיכון) – נשמרים על המשתמשת, כמו ברכישה הראשונה בקופה */
  phone: z.string().max(30).optional(),
  city: z.string().max(80).optional(),
  school: z.string().max(120).optional(),
});

/** מה שנקבע בשרת לפי סוג ההזמנה, לפני החלק המשותף (קופון, פרופיל, יצירת הבקשה) */
type Order = {
  plan: PayKey;
  categoryIds: number[];
  subjectsPending: boolean;
  listAmount: number;
  materialId: number | null;
  itemCategoryId: number | null;
  itemTitle: string | null;
};

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return json({ error: "בקשה לא מהאתר" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "יש להתחבר כדי לשלם" }, 401);
  if (user.suspended) return json({ error: "החשבון מושהה – לא ניתן לבצע רכישות" }, 403);

  const rl = await rateLimit({ key: limitKey("pay-intent", "user", user.id), limit: 10, windowSec: 600 });
  if (!rl.ok) return json({ error: TOO_MANY_MESSAGE }, 429);

  const cfg = await loadNedarimConfig();
  if (!cfg.enabled) return json({ error: "התשלום באתר אינו פעיל כרגע" }, 404);
  if (!cfg.ready) return json({ error: "התשלום באתר עדיין לא הוגדר במלואו. אפשר לפנות אלינו דרך «צור קשר»." }, 503);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "הבקשה גדולה מדי" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json({ error: "בקשה לא תקינה" }, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "נתוני הזמנה לא תקינים" }, 400);
  const input = parsed.data;
  const kind = orderKindOf(input.plan);

  const denied = async (reason: string, error: string, status = 400, extra: Record<string, unknown> = {}) => {
    await logAudit({ actorId: user.id, action: "purchase.denied", details: { reason, via: "nedarim", plan: input.plan, ...extra } });
    return json({ error }, status);
  };

  let order: Order;
  if (isPayableItemKind(input.plan)) {
    // --- פריט: הורדה בודדת / קובץ מורחב – אותם כללים ומחירים כמו purchaseAction הישן (loadPayableItem) ---
    const ref = input.plan === "single" ? { kind: "single" as const, materialId: input.materialId ?? 0 } : { kind: "bundle" as const, categoryId: input.categoryId ?? 0 };
    if (!("materialId" in ref ? ref.materialId : ref.categoryId)) return denied("item_missing", input.plan === "single" ? "חסר מזהה חומר" : "חסר מזהה תיקייה");
    const loaded = await loadPayableItem(ref);
    if (!loaded.ok) return denied(loaded.reason, loaded.error, 400, ref);
    const covered = await itemCoverageFor(user.id, loaded.item);
    if (covered) return denied(`item_${covered.coverage}`, covered.text, 409, { materialId: loaded.item.materialId, categoryId: loaded.item.categoryId });
    order = {
      plan: input.plan,
      categoryIds: [],
      subjectsPending: false,
      listAmount: loaded.item.listAmount,
      materialId: loaded.item.materialId,
      itemCategoryId: loaded.item.categoryId,
      itemTitle: loaded.item.title,
    };
  } else {
    // --- מסלול מנוי ---
    // כבר יש מנוי פעיל מאותו מסלול – לא נותנים לשלם פעמיים על אותו דבר
    if (await hasActiveSamePlan(user.id, input.plan)) {
      return denied("already_subscribed", "כבר יש לך מנוי פעיל במסלול הזה – אין צורך לשלם שוב. אפשר לראות אותו באזור האישי.", 409);
    }
    // מקצועות: אותם כללים כמו purchaseAction
    const uniq = [...new Set(input.categoryIds)];
    let subjectsPending = false;
    if (input.plan === "substitute_daily") {
      uniq.length = 0;
    } else if (input.plan === "yearly" && input.skipSubjects) {
      subjectsPending = true;
      uniq.length = 0;
    } else {
      if (uniq.length < 1) return denied("no_subjects", "יש לבחור לפחות מקצוע אחד");
      if (input.plan === "substitute_3m" && uniq.length > 1) return denied("sub3_too_many", "ממלאת מקום כוללת מקצוע אחד בלבד");
      if (input.plan === "yearly" && uniq.length > YEARLY_INCLUDED_SUBJECTS) {
        return denied("yearly_too_many_subjects", `המנוי כולל עד ${YEARLY_INCLUDED_SUBJECTS} מקצועות`);
      }
      const roots = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(inArray(categories.id, uniq), isNull(categories.parentId), eq(categories.status, "active")));
      if (roots.length !== uniq.length) return denied("not_root_subject", "יש לבחור מקצועות ראשיים בלבד");
    }
    const prices = await getPlanPrices();
    const listAmount = prices.plans[input.plan];
    if (!(listAmount > 0)) return denied("no_price", "למסלול הזה אין מחיר מוגדר", 500);
    order = { plan: input.plan, categoryIds: uniq, subjectsPending, listAmount, materialId: null, itemCategoryId: null, itemTitle: null };
  }

  // --- פרטי פרופיל חסרים: טלפון (מוטבע בסימן המים + מזהה את התשלום), עיר ותיכון (רכישה ראשונה) ---
  const profile: Partial<{ phone: string; city: string; school: string }> = {};
  if (!user.phone) {
    const p = phoneSchema.safeParse(input.phone ?? "");
    if (!p.success || !p.data) return denied("invalid_phone", p.success ? "יש להזין מספר טלפון" : p.error.issues[0]?.message ?? "טלפון לא תקין");
    profile.phone = p.data;
  }
  if (!user.city || !user.school) {
    const loc = z.object({ city: citySchema, school: schoolSchema }).safeParse({ city: input.city ?? "", school: input.school ?? "" });
    if (!loc.success) return denied("invalid_location", loc.error.issues[0]?.message ?? "יש להשלים עיר ותיכון");
    profile.city = loc.data.city;
    profile.school = loc.data.school;
  }

  // --- סכום: מחיר המחירון (מסלול/פריט – נקבע למעלה בשרת) + קופון הנחה פרטי (ייתפס רק בהשלמה), כמו purchaseAction ---
  const { listAmount } = order;
  const coupon = await getBestPercentCoupon(user);
  const pct = coupon?.percent ?? 0;
  const amount = pct > 0 ? Math.round((listAmount * (100 - pct)) / 100) : listAmount;
  if (!(amount > 0)) return denied("zero_amount", "הסכום לתשלום הוא 0 – פני אלינו להפעלה ידנית", 400);

  if (Object.keys(profile).length) {
    await db.update(users).set(profile).where(eq(users.id, user.id));
    await logAudit({ actorId: user.id, action: "profile.complete", entityType: "user", entityId: user.id, details: profile });
  }

  const params = { plan: order.plan, categoryIds: order.categoryIds, subjectsPending: order.subjectsPending, amount, materialId: order.materialId, itemCategoryId: order.itemCategoryId };
  const respond = async (row: Awaited<ReturnType<typeof createIntent>>, reused: boolean) =>
    json({
      ok: true,
      reused,
      reference: row.reference,
      amount: row.amount,
      listAmount: row.listAmount,
      couponPercent: row.couponPercent,
      hostedUrl: hostedUrlFor(row, cfg.mosadId),
      simulate: cfg.simulate,
      kind,
      itemTitle: row.itemTitle ?? null,
      successHref: await successHrefFor(row),
    });

  // M2/N2: בקשה פתוחה עם אותו קופון – לא יוצרים שנייה (הקופון חד-פעמי): אם אותה הזמנה בדיוק – מחזירים אותה; אחרת מבטלים
  // את הישנה ("replaced") ויוצרים חדשה (עסקה שתשולם על הישנה תישאר לא-משויכת וגלויה למנהלת)
  let replaced: { id: number } | null = null;
  if (coupon && pct > 0) {
    const existing = await findOpenWithCoupon(user.id, coupon.id);
    if (existing && !sameIntentParams({ plan: existing.plan, categoryIds: parseCategoryIds(existing), subjectsPending: existing.subjectsPending, amount: existing.amount, materialId: existing.materialId, itemCategoryId: existing.itemCategoryId }, params)) {
      if (await cancelReplaced(existing, "(חדשה)")) replaced = { id: existing.id };
    } else if (existing) {
      return respond(existing, true);
    }
  }

  const phone = user.phone ?? profile.phone ?? "";
  const nameParts = user.name.trim().split(/\s+/);
  const firstName = user.firstName ?? nameParts[0] ?? "";
  const lastName = user.lastName ?? nameParts.slice(1).join(" ");
  const { ip, userAgent } = await requestMeta();

  try {
    const row = await createIntent({
      userId: user.id,
      plan: order.plan,
      categoryIds: order.categoryIds,
      subjectsPending: order.subjectsPending,
      materialId: order.materialId,
      itemCategoryId: order.itemCategoryId,
      itemTitle: order.itemTitle,
      listAmount,
      amount,
      coupon: coupon && pct > 0 ? { id: coupon.id, percent: pct } : null,
      firstName,
      lastName,
      phone,
      email: user.email,
      mosadId: cfg.mosadId,
      ip,
      userAgent,
    });
    if (replaced) await appendEvent(replaced.id, "replaced_by", `הבקשה החדשה: ${row.reference}`, { newReference: row.reference });
    return respond(row, false);
  } catch (e) {
    console.error("[pay intent] create failed", redactNedarim(e instanceof Error ? e.message : String(e)));
    return json({ error: "לא הצלחנו ליצור את בקשת התשלום. נסי שוב בעוד רגע." }, 500);
  }
}
