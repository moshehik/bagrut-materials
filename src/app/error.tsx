"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorSheet } from "@/components/error-sheet";

const GUARD_KEY = "err-soft-retry-at";

/**
 * תקלה בצד הדפדפן: מדווחים לשרת מה נפל (הודעה, מחסנית, ומשאבים שנטענו כושלים) – כדי לאתר תקלות שקורות רק אצל
 * מי שגולשת דרך מסנן תוכן (נטפרי), למשל דף הבית שקרס בכניסה ישירה ועלה תקין אחרי ניווט (2026-11-07).
 * הסיבה (React #412 "Connection closed"): נטפרי קוטע את זרם הנתונים שמוטמע בתוך ה-HTML של טעינה ישירה, ורענון דפדפן
 * חוזר על אותה טעינה ולכן לא עוזר. ניווט פנימי כן עובד כי הנתונים מגיעים בבקשה נפרדת – לכן בתקלה מבקשים מ-Next
 * לטעון את הדף מחדש בדיוק כך (router.refresh + reset), פעם אחת, לפני שמציגים הודעת תקלה.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    console.error(error);
    try {
      const last = Number(sessionStorage.getItem(GUARD_KEY) ?? 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(GUARD_KEY, String(Date.now()));
        setRetrying(true);
        setTimeout(() => setRetrying(false), 5000); // אם גם הניסיון השני נכשל – מציגים את דף התקלה
        startTransition(() => {
          router.refresh();
          reset();
        });
      }
    } catch {
      /* בלי sessionStorage – לא מנסים שוב אוטומטית */
    }
    try {
      const failed = performance
        .getEntriesByType("resource")
        .filter((r) => {
          const t = r as PerformanceResourceTiming;
          return t.transferSize === 0 && t.decodedBodySize === 0 && t.responseStatus !== 304;
        })
        .map((r) => r.name.replace(location.origin, ""));
      void fetch("/api/client-error", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          path: location.pathname,
          failed,
        }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }, [error, reset, router]);

  if (retrying) return null;
  return <ErrorSheet onRetry={reset} />;
}
