"use client";

import { useEffect } from "react";

/** גולל בעדינות אל אלמנט (ברירת מחדל: רשימת היום בלוח ההורדות) כשנבחר יום – כדי שיהיה ברור שהרשימה נפתחה מתחת ללוח. */
export function ScrollToSelected({ id = "day-list", when }: { id?: string; when?: string }) {
  useEffect(() => {
    if (!when) return;
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [id, when]);
  return null;
}
