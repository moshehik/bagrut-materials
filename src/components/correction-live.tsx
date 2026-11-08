"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * "ההערה שלך נבדקת": בודק ברקע אם הגיעה תשובה, ומרענן את הדף כשהמצב השתנה (ללא כפתור רענון ידני).
 * מתחשב בשרת: בדיקה קלה אחת (/api/my-correction-status – מזהים וסטטוסים בלבד) במקום רענון דף מלא; מרווח גדל (20 ש' ← עד 2 דק'); נעצר כשהכרטיסייה
 * ברקע (ובדיקה מיידית בחזרה אליה); נעצר אחרי 30 דקות של כרטיסייה פעילה; בדיקה אחת בלבד לכל חומר, עם סטייה אקראית קטנה.
 *
 * "בדיקה אחת לכל חומר" גם כשיש כמה צרכנים באותו דף (השעון בכרטיסייה + החלון הפתוח של עריכת השינויים): נועל לפי חומר – רק
 * הראשון שנרשם בודק; כשהוא יורד (למשל החלון נסגר) – הנועלים-בהמתנה מתעוררים ומתחילים לבדוק (אירוע correction-poll-released).
 */
const START_MS = 20_000;
const MAX_MS = 120_000;
const GIVE_UP_MS = 30 * 60_000;

/** חומר → מי מחזיק את נעילת הבדיקה כרגע (מזהה ייחודי של הצרכן) */
const lockHolder = new Map<number, symbol>();
const releasedEvent = (materialId: number) => `correction-poll-released:${materialId}`;

/**
 * בדיקה תקופתית עד שחתימת המצב משתנה, ואז router.refresh() (הדף הוא רכיב שרת – הוא יחושב מחדש עם התשובה/הגרסה החדשה).
 * enabled=false – לא בודק ולא תופס נעילה.
 */
export function useCorrectionPoll(materialId: number, signature: string, enabled = true) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const me = Symbol("poller");
    let stopped = false;
    let started = false;
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
      if (stopped || !started || document.hidden) return;
      if (timer) clearTimeout(timer);
      void check().then((changed) => {
        if (!changed) schedule();
      });
    };

    /** מנסה לתפוס את הנעילה (אם אף אחד אחר לא מחזיק אותה) ולהתחיל לבדוק */
    const tryStart = () => {
      if (stopped || started) return;
      if (lockHolder.has(materialId)) return;
      lockHolder.set(materialId, me);
      started = true;
      schedule();
    };

    const onReleased = () => tryStart();
    tryStart();
    window.addEventListener(releasedEvent(materialId), onReleased);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(releasedEvent(materialId), onReleased);
      document.removeEventListener("visibilitychange", onVisible);
      if (lockHolder.get(materialId) === me) {
        lockHolder.delete(materialId);
        // מי שחיכה (למשל השעון בכרטיסייה כשהחלון נסגר) ממשיך לבדוק
        window.dispatchEvent(new Event(releasedEvent(materialId)));
      }
    };
  }, [materialId, signature, enabled, router]);
}

export function CorrectionLive({ materialId, signature }: { materialId: number; signature: string }) {
  useCorrectionPoll(materialId, signature, true);
  return null;
}
