"use client";

import { useEffect } from "react";
import { NF_DIMS } from "@/lib/netfree-dims.generated";

/**
 * מגן נטפרי לתמונות: מסנן התוכן מחליף חלק מקובצי התמונה ברי-השימוש של האתר בריבוע לבן / תמונה מטושטשת.
 * ה-HTML מכיל נתיבי קובץ רגילים; כאן, אחרי שהתמונה נטענה, משווים את המידות שהדפדפן קיבל למידות המקור
 * (NF_DIMS, נוצר ב-scripts/gen-netfree-images.cjs). אם שונות – טוענים (פעם אחת, בעצלתיים) את גרסת ה-data URI
 * של אותה תמונה ומציבים אותה ב-src. גולשת בלי סינון לא מורידה את קובץ הנתונים הגדול בכלל.
 * (למה לא data URI ישירות ב-HTML: ר' הערה בראש scripts/gen-netfree-images.cjs.)
 */

let dataPromise: Promise<Record<string, string>> | null = null;
const loadData = () => (dataPromise ??= import("@/lib/netfree-data.generated").then((m) => m.NF_DATA));

function keyOf(img: HTMLImageElement): string | null {
  const raw = img.getAttribute("src");
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return null;
  try {
    const u = new URL(raw, location.href);
    if (u.origin !== location.origin) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

function check(img: HTMLImageElement) {
  if (!img.complete || img.dataset.nf) return;
  const key = keyOf(img);
  if (!key) return;
  const dims = NF_DIMS[key];
  if (!dims) return;
  const broken = img.naturalWidth === 0;
  if (!broken && img.naturalWidth === dims[0] && img.naturalHeight === dims[1]) return;
  img.dataset.nf = "1";
  void loadData().then((data) => {
    const uri = data[key];
    if (uri) {
      img.removeAttribute("srcset");
      img.src = uri;
    }
  });
}

export function NetfreeImageGuard() {
  useEffect(() => {
    const onLoad = (e: Event) => {
      if (e.target instanceof HTMLImageElement) check(e.target);
    };
    document.addEventListener("load", onLoad, true);
    document.addEventListener("error", onLoad, true);
    document.querySelectorAll("img").forEach(check);
    return () => {
      document.removeEventListener("load", onLoad, true);
      document.removeEventListener("error", onLoad, true);
    };
  }, []);
  return null;
}
