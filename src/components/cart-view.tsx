"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  ShoppingCart,
  Trash2,
  Loader2,
  AlertCircle,
  CreditCard,
  Lock,
  Sparkles,
  ChevronLeft,
  FileText,
  FolderOpen,
  Crown,
} from "lucide-react";
import type { Cart } from "@/lib/cart";
import { checkoutCart, clearCart, removeFromCart, setCartItemPremium } from "@/lib/actions/cart";
import { formatPrice } from "@/lib/constants";
import { emitCartChanged } from "@/components/add-to-cart-button";

const KIND_ICON = {
  single: <FileText className="h-5 w-5" />,
  bundle: <FolderOpen className="h-5 w-5" />,
  plan: <Crown className="h-5 w-5" />,
} as const;

export function CartView({ cart }: { cart: Cart }) {
  const [state, action, pending] = useActionState(checkoutCart, undefined);
  const [busy, start] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  // מסנכרן את התג ב-header עם מצב העגלה בכל רינדור
  useEffect(() => {
    emitCartChanged(cart.count);
  }, [cart.count]);

  function remove(id: number) {
    setBusyId(id);
    start(async () => {
      const r = await removeFromCart(id);
      if (r.ok) emitCartChanged(r.count);
      setBusyId(null);
    });
  }

  function togglePremium(id: number, value: boolean) {
    setBusyId(id);
    start(async () => {
      await setCartItemPremium(id, value);
      setBusyId(null);
    });
  }

  function clear() {
    start(async () => {
      const r = await clearCart();
      if (r.ok) emitCartChanged(0);
    });
  }

  if (!cart.items.length) {
    return (
      <div className="card p-10 text-center animate-fade-up">
        <span className="mx-auto grid place-items-center h-16 w-16 rounded-3xl bg-pink-soft text-pink mb-4">
          <ShoppingCart className="h-8 w-8" />
        </span>
        <h2 className="font-display text-2xl font-bold mb-2">העגלה שלך ריקה</h2>
        <p className="text-muted mb-6">הוסיפי חומרים, תיקיות שלמות או מסלול – ושלמי על הכול בבת אחת.</p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Link href="/subjects" className="btn btn-primary">
            למקצועות
          </Link>
          <Link href="/pricing" className="btn btn-ghost">
            למסלולים ומחירים
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
      <ul className="space-y-3">
        {cart.items.map((it) => {
          const rowBusy = busy && busyId === it.id;
          return (
            <li key={it.id} className="card p-4 sm:p-5 flex gap-4 animate-fade-up">
              <span
                className={`grid place-items-center h-11 w-11 rounded-2xl shrink-0 ${
                  it.kind === "plan"
                    ? "bg-gold-soft text-[#8a6500]"
                    : it.kind === "bundle"
                      ? "bg-blue-soft text-blue-deep"
                      : "bg-pink-soft text-pink"
                }`}
              >
                {KIND_ICON[it.kind]}
              </span>
              <div className="min-w-0 flex-1">
                {it.crumbs.length > 0 && (
                  <nav className="text-[11px] text-muted flex flex-wrap items-center gap-1 mb-1" aria-label="מיקום">
                    {it.crumbs.map((c, i) => (
                      <span key={c.href} className="flex items-center gap-1">
                        {i > 0 && <ChevronLeft className="h-3 w-3" />}
                        <Link href={c.href} className="hover:text-blue-deep hover:underline">
                          {c.title}
                        </Link>
                      </span>
                    ))}
                  </nav>
                )}
                <h3 className="font-bold leading-snug">
                  {it.href ? (
                    <Link href={it.href} className="hover:text-blue-deep">
                      {it.title}
                    </Link>
                  ) : (
                    it.title
                  )}
                </h3>
                <p className="text-xs text-muted">{it.subtitle}</p>

                {it.kind === "plan" && (
                  <label className="mt-3 inline-flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={it.premium}
                      disabled={rowBusy}
                      onChange={(e) => togglePremium(it.id, e.target.checked)}
                      className="h-4 w-4 accent-[var(--color-gold,#d9a21b)]"
                    />
                    <Sparkles className="h-4 w-4 text-gold" />
                    <span>
                      תוסף פרימיום{" "}
                      <span className="text-muted">
                        (+{formatPrice(it.premiumAddon)}
                        {it.months > 1 ? ` ל-${it.months} חודשים` : ""})
                      </span>
                    </span>
                  </label>
                )}
              </div>
              <div className="flex flex-col items-end justify-between shrink-0 gap-2">
                <div className="text-end">
                  <div className="font-display font-bold text-lg">{formatPrice(it.price)}</div>
                  {it.premium && it.premiumAddon > 0 && (
                    <div className="text-[11px] text-muted">כולל פרימיום</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  disabled={rowBusy}
                  className="text-xs text-muted hover:text-[#9d4a2a] inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-pink-soft/60"
                  aria-label={`הסרת ${it.title} מהעגלה`}
                >
                  {rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  הסרה
                </button>
              </div>
            </li>
          );
        })}
        <li className="text-end">
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline"
          >
            ריקון העגלה
          </button>
        </li>
      </ul>

      <aside className="card p-5 sm:p-6 lg:sticky lg:top-24 animate-fade-up [animation-delay:80ms]">
        <h2 className="font-display text-xl font-bold mb-4">סיכום הזמנה</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">פריטים</dt>
            <dd>{cart.count}</dd>
          </div>
          <div className="flex justify-between font-bold text-lg pt-3 border-t border-blue/10">
            <dt>סה"כ לתשלום</dt>
            <dd className="font-display">{formatPrice(cart.total)}</dd>
          </div>
        </dl>

        <form action={action} className="mt-5 space-y-3">
          {state?.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-pink-soft text-[#9d4a2a] px-4 py-3 text-sm animate-pop"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}
          <button type="submit" disabled={pending || busy} className="btn btn-gold w-full">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            לתשלום {formatPrice(cart.total)}
          </button>
          <p className="text-[11px] text-muted flex items-center justify-center gap-1">
            <Lock className="h-3 w-3" /> תשלום מאובטח · הקבצים יוטבעו במספר האישי שלך
          </p>
        </form>
      </aside>
    </div>
  );
}
