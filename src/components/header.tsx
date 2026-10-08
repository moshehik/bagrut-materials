"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogIn, UserRound, ShieldCheck } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { DizzyButton } from "@/components/dizzy-button";
import { SearchTriggerButton, SiteSearchOverlay } from "@/components/site-search";

type HeaderUser = { name: string; role: "user" | "admin" } | null;

const NAV = [
  { href: "/", label: "בית", tip: "מפרט האתר ועדכונים שותפים" },
  { href: "/subjects", label: "המקצועות", tip: "כניסה לחומרים דרך שם המקצוע" },
  { href: "/map", label: "מפת הבגרות", tip: "תרשים על חומר הבגרויות והסברים עליו\nתוכלי דרכו להיכנס למקצוע" },
  { href: "/pricing", label: "מסלולים", tip: "אופציות רכישה מגוונות" },
  { href: "/coupons", label: "קופונים זמינים", tip: "קופונים להוזלת הרכישה\nמשתנים מעט לעת או נגמרים" },
  { href: "/account", label: "אזור אישי", tip: "פרטים והודעות שמיועדים דווקא לך" },
  { href: "/account/downloads/calendar", label: "ההורדות שלי", tip: "לוח שנה עם כל ההורדות שלך" },
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

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-sea2/95 border-b border-white/10">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 xl:px-8 h-[74px] flex items-center gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 group" aria-label="דף הבית">
          <Logo variant="white" className="h-11 sm:h-12" />
        </Link>

        <nav className="hidden xl:flex items-center gap-1 ms-4" aria-label="ניווט ראשי">
          {NAV.map((n) => {
            const active =
              n.href === "/"
                ? path === "/"
                : n.href === "/account"
                  ? path === "/account" || (path.startsWith("/account/") && !path.startsWith("/account/downloads"))
                  : path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                data-tip={n.tip}
                data-tip-side="below"
                aria-current={active ? "page" : undefined}
                className="nav-btn !px-3.5 2xl:!px-[1.05rem] hover:-translate-y-0.5"
              >
                {n.label}
              </Link>
            );
          })}
          <SearchTriggerButton className="grid h-9 w-9 place-items-center rounded-full text-white/90 transition-colors transition-transform hover:-translate-y-0.5 hover:bg-white/10 hover:text-sun" />
        </nav>

        <div className="ms-auto hidden xl:flex shrink-0 items-center gap-2">
          {user ? (
            <>
              {user.role === "admin" && (
                <Link href="/admin" className="btn btn-gold text-sm py-2">
                  <ShieldCheck className="h-4 w-4" /> ניהול
                </Link>
              )}
              <Link href="/account" title="האזור האישי" className="btn btn-line-white text-sm py-2">
                <UserRound className="h-4 w-4" /> {user.name.split(" ")[0]}
              </Link>
              <form action={logoutAction}>
                <button className="text-sm text-white/70 hover:text-sun px-2 transition-transform hover:-translate-y-0.5">יציאה</button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/register"
                data-tip={"פעם ראשונה באתר?\nפותחים חשבון חדש"}
                className="text-[15px] font-semibold text-white/90 hover:text-sun px-2 transition-transform hover:-translate-y-0.5"
              >
                הצטרפות
              </Link>
              <Link href="/login" data-tip={"כבר יש לך חשבון?\nנכנסים עם המייל והסיסמה"} className="btn btn-gold text-sm py-2.5">
                <LogIn className="h-4 w-4" /> כניסה
              </Link>
            </>
          )}
        </div>

        <div className="ms-auto xl:hidden flex items-center gap-1">
          <button
            className="p-2 rounded-xl text-white hover:bg-white/10 transition-transform hover:scale-110"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="תפריט"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>

        <DizzyButton />
      </div>

      {open && (
        <div className="xl:hidden border-t border-sea/10 bg-plaster/95 animate-fade-up">
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
                <form action={logoutAction}>
                  <button className="w-full py-2 text-muted">יציאה</button>
                </form>
              </>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 flex flex-col items-stretch gap-1">
                  <Link href="/register" onClick={() => setOpen(false)} className="btn btn-ghost">
                    הצטרפות
                  </Link>
                  <span className="text-xs text-muted text-center leading-snug">פעם ראשונה באתר? פותחים חשבון חדש</span>
                </div>
                <div className="flex-1 flex flex-col items-stretch gap-1">
                  <Link href="/login" onClick={() => setOpen(false)} className="btn btn-sea">
                    כניסה
                  </Link>
                  <span className="text-xs text-muted text-center leading-snug">כבר יש לך חשבון? נכנסים עם המייל והסיסמה</span>
                </div>
              </div>
            )}
          </nav>
        </div>
      )}

      <SiteSearchOverlay />
    </header>
  );
}
