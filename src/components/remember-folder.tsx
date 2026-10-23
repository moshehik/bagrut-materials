"use client";

import { useEffect } from "react";
import { rememberFolder } from "@/lib/recent-folders";

/** לא מציג כלום: רושם את תיקיית הקבצים הנוכחית ברשימת "ביקרת לאחרונה" של חלון החיפוש (ר' recent-folders.ts) */
export function RememberFolder({ href, title, path }: { href: string; title: string; path: string }) {
  useEffect(() => {
    rememberFolder({ href, title, path });
  }, [href, title, path]);
  return null;
}
