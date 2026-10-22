import "server-only";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, type NedarimPayment } from "@/db/schema";
import { MATERIAL_KINDS } from "@/lib/constants";
import { chainSuspended, chainToHref, getActivePurchases, getCategoryChain, getDescendantIds } from "@/lib/data";
import { bundleAmountFor } from "@/lib/purchase-helpers";
import { ITEM_COVERED_TEXT, itemAlreadyCovered, itemSuccessHref, orderKindOf, type ItemCoverage, type PayableItemKind } from "./logic";

/**
 * רכישת פריט דרך נדרים (הורדה בודדת / קובץ מורחב) – צד השרת: טעינת הפריט עם אותם כללים ומחירים כמו הקופה הישנה
 * (purchaseAction / checkout), בדיקת "כבר שלך", וקישור ההצלחה. נקרא מ-/pay (הדף), מ-/api/pay/intent ומ-/api/pay/status.
 */
export type PayableItem = {
  kind: PayableItemKind;
  /** מזהה החומר (single) או התיקייה (bundle) */
  id: number;
  materialId: number | null;
  /** התיקייה (bundle) / התיקייה של החומר (single) – purchases.category_id */
  categoryId: number;
  title: string;
  /** תת-כותרת לתצוגה (סוג החומר / מספר החומרים בתיקייה) */
  subtitle: string;
  /** פירורי לחם (כותרות) – לתצוגה בלבד */
  crumbs: string[];
  /** דף הפרק / התיקייה באתר */
  href: string;
  /** מחיר מחירון באגורות (לפני קופון) – מחושב בשרת */
  listAmount: number;
  chainIds: number[];
};
export type LoadItemResult = { ok: true; item: PayableItem } | { ok: false; reason: string; error: string };

export async function loadPayableItem(ref: { kind: "single"; materialId: number } | { kind: "bundle"; categoryId: number }): Promise<LoadItemResult> {
  if (ref.kind === "single") {
    const [m] = await db.select().from(materials).where(eq(materials.id, ref.materialId)).limit(1);
    if (!m) return { ok: false, reason: "material_not_found", error: "החומר לא נמצא" };
    if (m.status !== "active") return { ok: false, reason: "material_inactive", error: "החומר מושהה זמנית ואינו זמין לרכישה" };
    const chain = await getCategoryChain(m.categoryId);
    if (!chain.length || chainSuspended(chain)) return { ok: false, reason: "chain_inactive", error: "התיקייה של החומר מושהית זמנית ואינה זמינה לרכישה" };
    if (m.access === "free") return { ok: false, reason: "material_free", error: "החומר הזה חינמי – אין צורך לרכוש אותו" };
    if (!(m.price > 0)) return { ok: false, reason: "no_price", error: "לחומר הזה אין מחיר מוגדר – פני אלינו" };
    return {
      ok: true,
      item: {
        kind: "single",
        id: m.id,
        materialId: m.id,
        categoryId: m.categoryId,
        title: m.title,
        subtitle: MATERIAL_KINDS[m.kind]?.label ?? "",
        crumbs: chain.map((c) => c.title),
        href: chainToHref(chain),
        listAmount: m.price,
        chainIds: chain.map((c) => c.id),
      },
    };
  }
  const [c] = await db.select().from(categories).where(eq(categories.id, ref.categoryId)).limit(1);
  if (!c) return { ok: false, reason: "folder_not_found", error: "התיקייה לא נמצאה" };
  if (c.status !== "active") return { ok: false, reason: "folder_inactive", error: "התיקייה מושהית זמנית ואינה זמינה לרכישה" };
  const chain = await getCategoryChain(c.id);
  if (!chain.length || chainSuspended(chain)) return { ok: false, reason: "chain_inactive", error: "התיקייה מושהית זמנית ואינה זמינה לרכישה" };
  const ids = await getDescendantIds(c.id);
  const [cnt] = ids.length ? await db.select({ n: count() }).from(materials).where(inArray(materials.categoryId, ids)) : [{ n: 0 }];
  const n = Number(cnt?.n ?? 0);
  const amount = await bundleAmountFor(c); // אותו חישוב כמו בקופה הישנה (מחיר ידני / 15 ₪ ליחידה / 70% מסכום החומרים)
  if (!(amount > 0) || n === 0) return { ok: false, reason: "empty_folder", error: "אין חומרים לרכישה בתיקייה זו" };
  return {
    ok: true,
    item: {
      kind: "bundle",
      id: c.id,
      materialId: null,
      categoryId: c.id,
      title: c.title,
      subtitle: `${n} חומרים בתיקייה ובכל תתי-הפרקים שלה${!c.bundlePrice && ids.length > 1 ? " · 30% הנחה לעומת רכישה בודדת" : ""}`,
      crumbs: chain.slice(0, -1).map((x) => x.title),
      href: chainToHref(chain),
      listAmount: amount,
      chainIds: chain.map((x) => x.id),
    },
  };
}

/** "כבר שלך" – רכישה כפולה של אותו פריט / תיקיית-אב / מנוי שמכסה (itemAlreadyCovered על הרכישות הפעילות) */
export async function itemCoverageFor(userId: number, item: PayableItem): Promise<{ coverage: ItemCoverage; text: string } | null> {
  const active = await getActivePurchases(userId);
  const coverage = itemAlreadyCovered(item.kind, { materialId: item.materialId, categoryId: item.categoryId, chainIds: item.chainIds }, active);
  return coverage ? { coverage, text: ITEM_COVERED_TEXT[coverage] } : null;
}

/**
 * הקישור שאליו שולחים אחרי "שולם": פריט → דף הפרק (single) / דף התיקייה עם הורדת כל הקבצים (bundle, ?dlall=1 כמו בקופה
 * הישנה); מסלול מנוי → האזור האישי. נבנה מהשרשרת הנוכחית של הקטגוריה (אם נמחקה – האזור האישי).
 */
export async function successHrefFor(row: Pick<NedarimPayment, "plan" | "itemCategoryId">): Promise<string> {
  const kind = orderKindOf(row.plan);
  if (kind === "plan" || !row.itemCategoryId) return "/account";
  try {
    const chain = await getCategoryChain(row.itemCategoryId);
    if (!chain.length) return "/account";
    return itemSuccessHref(kind, chainToHref(chain));
  } catch {
    return "/account";
  }
}
