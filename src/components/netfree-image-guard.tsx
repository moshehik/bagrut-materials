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
  // הסימן המהימן: גודל הגוף שהתקבל (resource timing, אותו מקור) לעומת גודל קובץ המקור – התחליף של נטפרי (טשטוש/ריבוע)
  // יכול לשמור על אותן מידות אבל לעולם לא על אותו גודל בתים. מידות משמשות כגיבוי כשאין רשומת תזמון.
  const entry = performance.getEntriesByName(img.currentSrc || img.src)[0] as PerformanceResourceTiming | undefined;
  const size = entry && entry.decodedBodySize > 0 ? entry.decodedBodySize : 0;
  const broken = img.naturalWidth === 0;
  const sameSize = size ? size === dims[2] : true;
  const sameDims = img.naturalWidth === dims[0] && img.naturalHeight === dims[1];
  if (!broken && sameSize && sameDims) {
    // אין רשומת תזמון (תמונה מהמטמון): בודקים את גודל הגוף בבקשה מהמטמון, כי תחליף של נטפרי יכול לשמור על אותן מידות
    if (!size && !img.dataset.nfChecked) {
      img.dataset.nfChecked = "1";
      void fetch(img.currentSrc || img.src, { cache: "force-cache" })
        .then((r) => r.blob())
        .then((b) => {
          if (b.size !== dims[2]) swap(img, key);
        })
        .catch(() => {});
    }
    return;
  }
  swap(img, key);
}

function swap(img: HTMLImageElement, key: string) {
  if (img.dataset.nf) return;
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
    try {
      performance.setResourceTimingBufferSize(1500);
    } catch {
      /* ignore */
    }
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
