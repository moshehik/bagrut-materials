"use client";

import { useEffect, useRef } from "react";
import { FOLDER_FILES_EVENT, waitForNetfree } from "@/lib/netfree-client";

/**
 * אחרי רכישת תיקייה (?dlall=1) מפעיל הורדה אוטומטית. רגיל: קובץ ZIP אחד, בלחיצה על קישור כדי שאגוז הטעינה יופיע.
 * מאחורי נטפרי (עוגיית nf=1, ר' netfree-detector.tsx) זיפ נחסם, ולכן מורידים את הקבצים אחד אחד (FolderAllActions מבצע,
 * לפי האירוע). ממתינים עד 4 שניות לתוצאת הזיהוי; אם לא נודע – ZIP כמו קודם.
 */
export function AutoFolderDownload({ href, categoryId }: { href: string; categoryId: number }) {
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
    void waitForNetfree(4000).then((blocked) => {
      if (blocked) window.dispatchEvent(new CustomEvent(FOLDER_FILES_EVENT, { detail: { categoryId } }));
      else ref.current?.click();
    });
  }, [categoryId]);

  return <a ref={ref} href={href} className="sr-only" tabIndex={-1} aria-hidden />;
}
