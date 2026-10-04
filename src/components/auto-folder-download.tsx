"use client";

import { useEffect, useRef } from "react";

/** אחרי רכישת תיקייה (?dlall=1) מפעיל את הורדת ה-ZIP אוטומטית, בלחיצה על קישור כדי שאגוז הטעינה יופיע */
export function AutoFolderDownload({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    try {
      const url = new URL(location.href);
      url.searchParams.delete("dlall");
      history.replaceState(null, "", url.pathname + url.search);
    } catch {
      /* לא קריטי */
    }
    ref.current?.click();
  }, []);

  return <a ref={ref} href={href} className="sr-only" tabIndex={-1} aria-hidden />;
}
