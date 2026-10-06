"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

/**
 * כפתור "חזרה" אחיד בראש כל דף פנימי (בכל שלב באתר), במקום קבוע – מיד אחרי "דלגי לתוכן הראשי".
 *
 * - אם כבר עברנו בין דפים בתוך האתר – חוזר צעד אחד בהיסטוריה (כך גם שלבי תשלום/הרשמה חוזרים בדיוק לשלב הקודם).
 * - אחרת (נכנסנו ישר לדף, או בלי JavaScript) – קישור רגיל לדף ה"אב" ההגיוני שלו.
 * - מונגש: <nav> עם שם, קישור אמיתי (עובד במקלדת/קורא מסך/בלי JS), מטרת לחיצה 44px לפחות,
 *   טקסט גלוי "חזרה" שכלול בשם הנגיש, טבעת פוקוס מה-:focus-visible הגלובלי, ולא נדפס.
 */

/** דפים שכבר מציגים כפתור חזרה משלהם (AccountTitle back / BackButton באזור האישי) – אין צורך בכפול. */
const HAS_OWN_BACK = new Set([
  "/account/details",
  "/account/purchases",
  "/account/interests",
  "/account/subjects",
  "/account/upgrade",
  "/account/payments",
  "/account/downloads/calendar",
]);

/** דף שהחזרה ממנו לא הולכת פשוט "קטע אחד למעלה". */
const PARENT_OVERRIDE: Record<string, string> = {
  "/checkout": "/pricing",
  "/cart": "/subjects",
  "/register": "/login",
  "/forgot-password": "/login",
  "/reset-password": "/login",
  "/account/complete": "/account",
};

const PARENT_LABEL: Record<string, string> = {
  "/": "לדף הבית",
  "/subjects": "למקצועות",
  "/pricing": "לדף המחירים",
  "/login": "להתחברות",
  "/account": "לאזור האישי",
  "/admin": "לאזור הניהול",
  "/forum": "לפורום",
};

function parentOf(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (PARENT_OVERRIDE[clean]) return PARENT_OVERRIDE[clean];
  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

export function GlobalBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const lastPath = useRef<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  // הרכיב נשאר מורכב בין דפים (layout): אם הנתיב השתנה מאז הפעם הקודמת – היה ניווט פנימי,
  // וחזרה בהיסטוריה בטוחה. (בדיקה לפי שינוי נתיב ולא מונה, כדי ש-Strict Mode לא ייספר פעמיים.)
  useEffect(() => {
    if (lastPath.current !== null && lastPath.current !== pathname) setCanGoBack(true);
    lastPath.current = pathname;
  }, [pathname]);

  if (pathname === "/" || HAS_OWN_BACK.has(pathname.replace(/\/+$/, ""))) return null;

  const parent = parentOf(pathname);
  const parentLabel = PARENT_LABEL[parent];
  const ariaLabel = canGoBack
    ? "חזרה לשלב הקודם"
    : parentLabel
      ? `חזרה ${parentLabel}`
      : "חזרה לדף הקודם";

  return (
    <nav aria-label="חזרה אחורה" className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 print:hidden">
      <Link
        href={parent}
        aria-label={ariaLabel}
        onClick={(e) => {
          // קליק רגיל בלבד; Ctrl/⌘/אמצעי נשאר "פתח בלשונית חדשה"
          if (!canGoBack || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          router.back();
        }}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-sea2 bg-white px-5 text-base font-bold text-sea2 transition-colors hover:bg-blue-soft"
      >
        <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
        חזרה
      </Link>
    </nav>
  );
}
