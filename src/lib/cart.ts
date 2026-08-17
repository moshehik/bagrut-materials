import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, categories, materials, type Category, type Plan } from "@/db/schema";
import { PLANS, PREMIUM_ADDON_PRICE } from "@/lib/constants";
import { getCategoryChain, chainToHref, getDescendantIds } from "@/lib/data";

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
  premium: boolean;
  /** תוספת פרימיום (למסלולים בלבד – לפי חודשים) */
  premiumAddon: number;
  months: number;
  price: number;
};

export type Cart = { items: CartLine[]; total: number; count: number };

/** מחיר תיקייה: bundlePrice, ואם אין – 70% מסכום החומרים שתחתיה */
export async function bundlePrice(c: Category): Promise<number> {
  if (c.bundlePrice) return c.bundlePrice;
  const ids = await getDescendantIds(c.id);
  const ms = ids.length
    ? await db.select({ price: materials.price }).from(materials).where(inArray(materials.categoryId, ids))
    : [];
  return Math.round(ms.reduce((s, x) => s + x.price, 0) * 0.7);
}

/** העגלה של המשתמשת – פריטים מצורפים לחומר/קטגוריה, מחירים וסה"כ */
export async function getCart(userId: number): Promise<Cart> {
  const rows = await db
    .select({ item: cartItems, material: materials, category: categories })
    .from(cartItems)
    .leftJoin(materials, eq(cartItems.materialId, materials.id))
    .leftJoin(categories, eq(cartItems.categoryId, categories.id))
    .where(eq(cartItems.userId, userId))
    .orderBy(desc(cartItems.createdAt));

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
        premium: false,
        premiumAddon: 0,
        months: 0,
        price: material.price,
      });
    } else if (plan === "bundle") {
      if (!category) continue;
      const price = await bundlePrice(category);
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
        premium: false,
        premiumAddon: 0,
        months: 0,
        price,
      });
    } else {
      const def = PLANS[plan];
      const months = Math.max(1, Math.round((def.days ?? 30) / 30));
      const base = def.price ?? 0;
      const addon = item.premium ? PREMIUM_ADDON_PRICE * months : 0;
      items.push({
        id: item.id,
        kind: "plan",
        plan,
        materialId: null,
        categoryId: category?.id ?? null,
        title: def.label + (category ? ` – ${category.title}` : ""),
        subtitle: def.description,
        crumbs: plan === "subject_monthly" ? crumbs : [],
        href: plan === "subject_monthly" ? catHref : "/pricing",
        basePrice: base,
        premium: item.premium,
        premiumAddon: PREMIUM_ADDON_PRICE * months,
        months,
        price: base + addon,
      });
    }
  }
  const total = items.reduce((s, i) => s + i.price, 0);
  return { items, total, count: items.length };
}
