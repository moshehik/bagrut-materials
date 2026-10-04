"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, LogIn, UserRound, ShieldCheck, ShoppingCart } from "lucide-react";
import { TIERS } from "@/lib/constants";
import type { Tier } from "@/db/schema";
import { logoutAction } from "@/lib/actions/auth";
import { SearchTriggerButton, SiteSearchOverlay } from "@/components/site-search";

type HeaderUser = { name: string; role: "user" | "admin"; tier: Tier } | null;

const CART_CHANGED_EVENT = "cart:changed";

/** מספר פריטי העגלה – נטען מ-/api/cart/count ומתעדכן באירוע cart:changed */
function useCartCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      fetch("/api/cart/count", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((d: { count?: number }) => alive && setCount(Number(d.count ?? 0)))
        .catch(() => {});
    load();
    const onChange = (e: Event) => {
      const c = (e as CustomEvent<{ count?: number }>).detail?.count;
      if (typeof c === "number") setCount(c);
      else load();
    };
    window.addEventListener(CART_CHANGED_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CART_CHANGED_EVENT, onChange);
    };
  }, [enabled]);
  return count;
}

function CartLink({ count, className, onClick, withLabel }: { count: number; className?: string; onClick?: () => void; withLabel?: boolean }) {
  return (
    <Link
      href="/cart"
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 transition-transform hover:-translate-y-0.5 ${className ?? ""}`}
      aria-label={`עגלת קניות${count ? ` – ${count} פריטים` : ""}`}
    >
      <span className="relative">
        <ShoppingCart className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-2 -start-2 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-terra text-white text-[10px] font-bold leading-none animate-pop">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      {withLabel && <span>עגלה{count ? ` (${count})` : ""}</span>}
    </Link>
  );
}

const NAV = [
  { href: "/", label: "בית" },
  { href: "/subjects", label: "המקצועות" },
  { href: "/map", label: "מפת הבגרות" },
  { href: "/pricing", label: "מסלולים" },
  { href: "/coupons", label: "קופונים זמינים" },
  { href: "/account/downloads", label: "ההורדות שלי" },
];

/** לוגו "לו״ז העניין" — איור העז והלוח (רקע שקוף) */
export function Logo({ className = "", variant = "color" }: { className?: string; variant?: "color" | "white" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={variant === "white" ? "/images/logo-white.png" : "/images/logo.png"}
      alt="לו״ז העניין – בית לחומרי הבגרות"
      width={1491}
      height={871}
      className={`w-auto ${className}`}
    />
  );
}

export function Header({ user }: { user: HeaderUser }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const cartCount = useCartCount(!!user);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-sea2/95 border-b border-white/10">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 h-[74px] flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 group" aria-label="דף הבית">
          <Logo variant="white" className="h-11 sm:h-12" />
          <span className="hidden sm:block text-[11px] font-semibold text-white/70 tracking-wide border-s border-white/20 ps-3 leading-tight">
            מתמקדים
            <br />
            בעיקר
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ms-6" aria-label="ניווט ראשי">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className="nav-btn hover:-translate-y-0.5"
              >
                {n.label}
              </Link>
            );
          })}
          <SearchTriggerButton className="grid h-9 w-9 place-items-center rounded-full text-white/90 transition-colors transition-transform hover:-translate-y-0.5 hover:bg-white/10 hover:text-sun" />
        </nav>

        <div className="ms-auto hidden lg:flex items-center gap-2">
          {user ? (
            <>
              {user.role === "admin" && (
                <Link href="/admin" className="btn btn-gold text-sm py-2">
                  <ShieldCheck className="h-4 w-4" /> ניהול
                </Link>
              )}
              {user.tier !== "none" && (
                <span
                  className="chip"
                  style={{ background: TIERS[user.tier].color + "22", color: TIERS[user.tier].color }}
                >
                  {TIERS[user.tier].icon} {TIERS[user.tier].label}
                </span>
              )}
              <CartLink
                count={cartCount}
                className="p-2 rounded-full text-white/80 hover:bg-white/10 hover:text-sun transition-colors"
              />
              <Link href="/account" className="btn btn-line-white text-sm py-2">
                <UserRound className="h-4 w-4" /> {user.name.split(" ")[0]}
              </Link>
              <form action={logoutAction}>
                <button className="text-sm text-white/70 hover:text-sun px-2 transition-transform hover:-translate-y-0.5">יציאה</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/register" className="text-[15px] font-semibold text-white/90 hover:text-sun px-2 transition-transform hover:-translate-y-0.5">
                הצטרפות
              </Link>
              <Link href="/login" className="btn btn-gold text-sm py-2.5">
                <LogIn className="h-4 w-4" /> כניסה
              </Link>
            </>
          )}
        </div>

        <div className="ms-auto lg:hidden flex items-center gap-1">
          {user && (
            <CartLink count={cartCount} className="p-2 rounded-xl hover:bg-white/10 text-white/80" />
          )}
          <button
            className="p-2 rounded-xl text-white hover:bg-white/10 transition-transform hover:scale-110"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="תפריט"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-sea/10 bg-plaster/95 animate-fade-up">
          <nav className="flex flex-col p-4 gap-2" aria-label="ניווט נייד">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="nav-btn justify-center py-2.5"
              >
                {n.label}
              </Link>
            ))}
            <SearchTriggerButton
              onClick={() => setOpen(false)}
              label="חיפוש"
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-blue-soft font-semibold transition-transform hover:-translate-y-0.5"
            />
            <div className="h-px bg-sea/10 my-2" />
            {user ? (
              <>
                {user.role === "admin" && (
                  <Link href="/admin" onClick={() => setOpen(false)} className="btn btn-oak">
                    ניהול האתר
                  </Link>
                )}
                <Link href="/account" onClick={() => setOpen(false)} className="btn btn-ghost">
                  האזור האישי
                </Link>
                <CartLink
                  count={cartCount}
                  withLabel
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 rounded-xl hover:bg-pink-soft font-semibold"
                />
                <form action={logoutAction}>
                  <button className="w-full py-2 text-muted">יציאה</button>
                </form>
              </>
            ) : (
              <div className="flex gap-2">
                <Link href="/register" onClick={() => setOpen(false)} className="btn btn-ghost flex-1">
                  הצטרפות
                </Link>
                <Link href="/login" onClick={() => setOpen(false)} className="btn btn-sea flex-1">
                  כניסה
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}

      <SiteSearchOverlay />
    </header>
  );
}
