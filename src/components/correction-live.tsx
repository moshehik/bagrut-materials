"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * "ההערה שלך נבדקת": בודק ברקע אם הגיעה תשובה, ומרענן את הדף כשהמצב השתנה (ללא כפתור רענון ידני).
 * מתחשב בשרת: בדיקה קלה אחת (/api/my-correction-status) במקום רענון דף מלא; מרווח גדל (20 ש' ← עד 2 דק'); נעצר כשהכרטיסייה
 * ברקע (ובדיקה מיידית בחזרה אליה); נעצר אחרי 30 דקות של כרטיסייה פעילה; בדיקה אחת בלבד לכל חומר, עם סטייה אקראית קטנה.
 */
const START_MS = 20_000;
const MAX_MS = 120_000;
const GIVE_UP_MS = 30 * 60_000;

export function CorrectionLive({ materialId, signature }: { materialId: number; signature: string }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    let delay = START_MS;
    let activeMs = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const res = await fetch(`/api/my-correction-status?ids=${materialId}`, { cache: "no-store" });
        if (!res.ok) return false;
        const data = (await res.json()) as { sigs?: Record<string, string> };
        const now = data.sigs?.[String(materialId)];
        if (now && now !== signature) {
          stopped = true;
          router.refresh();
          return true;
        }
      } catch {
        /* ננסה שוב במחזור הבא */
      }
      return false;
    };

    const schedule = () => {
      if (stopped) return;
      const jitter = 0.85 + Math.random() * 0.3;
      timer = setTimeout(async () => {
        if (stopped) return;
        if (document.hidden) return; // ברקע: לא בודקים; visibilitychange יחדש
        activeMs += delay;
        if (activeMs > GIVE_UP_MS) return;
        const changed = await check();
        if (changed) return;
        delay = Math.min(MAX_MS, Math.round(delay * 1.5));
        schedule();
      }, delay * jitter);
    };

    const onVisible = () => {
      if (stopped || document.hidden) return;
      if (timer) clearTimeout(timer);
      void check().then((changed) => {
        if (!changed) schedule();
      });
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [materialId, signature, router]);
  return null;
}
