"use client";

import { useEffect } from "react";
import { probeNetfreeVideo } from "@/lib/netfree-probe";

/**
 * בדיקה ברקע, פעם בכמה שעות, האם הגולשת מאחורי נטפרי (חוסם סרטונים). רצה רק אחרי שהדף נטען ובזמן "סרק" של הדפדפן,
 * כך שאינה מעכבת את הטעינה. התוצאה נשמרת בקוקי nf (1/0) ובאירוע nf-detected, והשרת משתמש בה בהורדת מצגות.
 */
export function NetfreeDetector() {
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      void probeNetfreeVideo().then((blocked) => {
        if (cancelled) return;
        window.dispatchEvent(new CustomEvent("nf-detected", { detail: blocked }));
      });
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const start = () => (w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 2500));
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
