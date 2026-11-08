"use client";

import { probeNetfreeVideo } from "@/lib/netfree-probe";

/**
 * זיהוי נטפרי בצד הדפדפן, מהעוגייה nf שנקבעת ברקע (netfree-probe.ts / netfree-detector.tsx): "1" = מאחורי מסנן, "0" = לא, אין = עוד לא נבדק.
 */
export function netfreeCookie(): boolean | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)nf=([01])(?:;|$)/);
    return m ? m[1] === "1" : null;
  } catch {
    return null;
  }
}

/**
 * מחזיר אם הדפדפן מאחורי נטפרי: מיד אם העוגייה nf קיימת, אחרת מריץ את הבדיקה בעצמו (מהמטמון המקומי או בקשת בדיקה) ומחכה עד timeoutMs.
 * לא סומכים רק על NetfreeDetector: הוא רץ בטעינת דף מלאה, ובמעבר פנימי באתר העוגייה (20 דקות כשחסום) יכולה כבר להיות פגה.
 * null = לא נודע בזמן.
 */
export async function waitForNetfree(timeoutMs = 4000): Promise<boolean | null> {
  const now = netfreeCookie();
  if (now !== null) return now;
  const r = await Promise.race([probeNetfreeVideo(), new Promise<null>((res) => setTimeout(() => res(null), timeoutMs))]);
  return r === null ? netfreeCookie() : r;
}

/** אירוע: מפעיל את ההורדה "בקבצים נפרדים" של תיקייה (FolderAllActions מאזין). detail = { categoryId } */
export const FOLDER_FILES_EVENT = "folder-files-download";
