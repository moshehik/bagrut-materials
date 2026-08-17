"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, BookOpen, Crown, LogIn, UserRound, ShieldCheck } from "lucide-react";
import { SITE_NAME, TIERS } from "@/lib/constants";
import type { Tier } from "@/db/schema";
import { logoutAction } from "@/lib/actions/auth";

type HeaderUser = { name: string; role: "user" | "admin"; tier: Tier } | null;

const NAV = [
  { href: "/subjects", label: "המקצועות" },
  { href: "/map", label: "מפת הבגרות" },
  { href: "/pricing", label: "מסלולים ומחירים" },
  { href: "/forum", label: "פורום מורות" },
  { href: "/sell", label: "מכירת חומרים" },
];

export function Header({ user }: { user: HeaderUser }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/75 border-b border-blue/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 group" aria-label="דף הבית">
          <span className="relative grid place-items-center h-10 w-10 rounded-2xl bg-gradient-to-br from-blue to-blue-deep text-white shadow-lg shadow-blue/30 group-hover:rotate-6 transition-transform">
            <BookOpen className="h-5 w-5" />
            <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-pink animate-float" />
          </span>
          <span className="font-display font-bold text-xl leading-none">
            {SITE_NAME}
            <span className="block text-[10px] font-sans font-medium text-muted tracking-wide">
              המחוז החרדי · שיעורים מוכנים
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ms-6" aria-label="ניווט ראשי">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-soft text-blue-deep"
                    : "text-foreground/80 hover:bg-blue-soft/60 hover:text-blue-deep"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto hidden md:flex items-center gap-2">
          {user ? (
            <>
              {user.role === "admin" && (
                <Link href="/admin" className="btn btn-oak text-sm py-2">
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
              <Link href="/account" className="btn btn-ghost text-sm py-2">
                <UserRound className="h-4 w-4" /> {user.name.split(" ")[0]}
              </Link>
              <form action={logoutAction}>
                <button className="text-sm text-muted hover:text-foreground px-2">יציאה</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost text-sm py-2">
                <LogIn className="h-4 w-4" /> התחברות
              </Link>
              <Link href="/register" className="btn btn-primary text-sm py-2">
                <Crown className="h-4 w-4" /> הצטרפות
              </Link>
            </>
          )}
        </div>

        <button
          className="ms-auto md:hidden p-2 rounded-xl hover:bg-blue-soft"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="תפריט"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-blue/10 bg-white/95 animate-fade-up">
          <nav className="flex flex-col p-4 gap-1" aria-label="ניווט נייד">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-xl hover:bg-blue-soft font-medium"
              >
                {n.label}
              </Link>
            ))}
            <div className="h-px bg-blue/10 my-2" />
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
                <form action={logoutAction}>
                  <button className="w-full py-2 text-muted">יציאה</button>
                </form>
              </>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" onClick={() => setOpen(false)} className="btn btn-ghost flex-1">
                  התחברות
                </Link>
                <Link href="/register" onClick={() => setOpen(false)} className="btn btn-primary flex-1">
                  הצטרפות
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
