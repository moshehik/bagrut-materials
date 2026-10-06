import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, categories, materials, type Category, type Plan } from "@/db/schema";
import { PLANS, isRetiredPlan } from "@/lib/constants";
import { getCategoryChain, chainToHref } from "@/lib/data";
import { getPlanPrices } from "@/lib/pricing";
import { bundleAmountFor, planAmountFor } from "@/lib/purchase-helpers";

/** מספר פריטים בעגלה */
export async function cartCount(userId: number) {
  const rows = await db.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.userId, userId));
  return rows.length;
}

export type CartLine = {
  id: number;
  kind: "single" | "bundle" | "plan";
  plan: Plan;
  materialId: number | null;
  categoryId: number | null;
  title: string;
  subtitle: string;
  /** breadcrumb של הקטגוריה */
  crumbs: { title: string; href: string }[];
  href: string | null;
  basePrice: number;
  months: number;
  price: number;
  /** מסלול ישן שכבר לא נמכר (RETIRED_PLANS) – מוצג כדי שאפשר יהיה להסיר אותו; הקופה מסרבת לו */
  retired: boolean;
};

export type Cart = { items: CartLine[]; total: number; count: number };

/** מחיר תיקייה – אותו חישוב כמו בקופה (bundlePriceFor דרך purchase-helpers) */
export async function bundlePrice(c: Category): Promise<number> {
  return bundleAmountFor(c);
}

/** העגלה של המשתמשת – פריטים מצורפים לחומר/קטגוריה, מחירים וסה"כ (מחירים מאותו מקור כמו purchaseAction) */
export async function getCart(userId: number): Promise<Cart> {
  const rows = await db
    .select({ item: cartItems, material: materials, category: categories })
    .from(cartItems)
    .leftJoin(materials, eq(cartItems.materialId, materials.id))
    .leftJoin(categories, eq(cartItems.categoryId, categories.id))
    .where(eq(cartItems.userId, userId))
    .orderBy(desc(cartItems.createdAt));

  const prices = await getPlanPrices();
  const items: CartLine[] = [];
  for (const { item, material, category } of rows) {
    const plan: Plan = item.plan ?? (item.materialId ? "single" : item.categoryId ? "bundle" : "single");
    const catId = material?.categoryId ?? category?.id ?? null;
    const chain = catId ? await getCategoryChain(catId) : [];
    const crumbs = chain.map((c, i) => ({ title: c.title, href: chainToHref(chain.slice(0, i + 1)) }));
    const catHref = chain.length ? chainToHref(chain) : null;

    if (plan === "single") {
      if (!material) continue; // חומר נמחק
      items.push({
        id: item.id,
        kind: "single",
        plan,
        materialId: material.id,
        categoryId: material.categoryId,
        title: material.title,
        subtitle: "הורדה בודדת",
        crumbs,
        href: catHref,
        basePrice: material.price,
        months: 0,
        price: material.price,
        retired: false,
      });
    } else if (plan === "bundle") {
      if (!category) continue;
      const price = await bundleAmountFor(category);
      items.push({
        id: item.id,
        kind: "bundle",
        plan,
        materialId: null,
        categoryId: category.id,
        title: category.title,
        subtitle: "קובץ מורחב – תיקייה שלמה",
        crumbs,
        href: catHref,
        basePrice: price,
        months: 0,
        price,
        retired: false,
      });
    } else {
      const def = PLANS[plan];
      const amount = planAmountFor(plan, prices);
      items.push({
        id: item.id,
        kind: "plan",
        plan,
        materialId: null,
        categoryId: category?.id ?? null,
        title: def.label + (category ? ` – ${category.title}` : ""),
        subtitle: def.description,
        crumbs: [],
        href: "/pricing",
        basePrice: amount.base,
        months: amount.months,
        price: amount.total,
        retired: isRetiredPlan(plan),
      });
    }
  }
  const total = items.reduce((s, i) => s + i.price, 0);
  return { items, total, count: items.length };
}
