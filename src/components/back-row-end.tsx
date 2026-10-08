"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** id של החריץ בצד שמאל של שורת "חזרה" (GlobalBackButton) */
export const BACK_ROW_END_ID = "back-row-end";

/**
 * מציג את התוכן בשורת "חזרה" הגלובלית, בצד שמאל (מקביל לכפתור החזרה),
 * בלי שהדף יצטרך לדעת איפה בדיוק השורה הזאת יושבת.
 */
export function BackRowEnd({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(BACK_ROW_END_ID));
  }, []);
  return slot ? createPortal(children, slot) : null;
}
