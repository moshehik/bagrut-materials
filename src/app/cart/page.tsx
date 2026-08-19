import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getCart } from "@/lib/cart";
import { getBool } from "@/lib/settings";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = { title: "עגלת הקניות" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/cart");

  const enabled = await getBool("cart_enabled");
  const cart = await getCart(user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex items-center gap-3 mb-6">
        <span className="grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-pink to-[#9d4a2a] text-white shadow-lg shadow-pink/30">
          <ShoppingCart className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">עגלת הקניות</h1>
          <p className="text-sm text-muted">
            {cart.count ? `${cart.count} פריטים מחכים לך` : "עדיין אין פריטים בעגלה"}
          </p>
        </div>
        <Link href="/subjects" className="ms-auto btn btn-ghost text-sm py-2">
          להמשך גלישה <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {!enabled && (
        <div className="card p-4 mb-6 bg-gold-soft/60 text-sm">
          העגלה אינה פעילה כרגע. אפשר עדיין לרכוש כל פריט בנפרד מדף החומר.
        </div>
      )}

      <CartView cart={cart} />
    </div>
  );
}
