"use client";

import { useEffect, useRef, useState } from "react";
import { useCalm } from "@/lib/calm-mode";

/**
 * מספר שסופר מ-0 עד הערך העדכני בכל פעם שהדף נטען (ברגע שהוא נכנס למסך).
 * ה-SSR מציג את הערך הסופי, כך שבלי JS או ל-prefers-reduced-motion המספר נשאר נכון.
 */
export function CountUp({ value, duration = 1400 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const calm = useCalm();

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (calm) {
      setShown(value); // "אני מסוחררת": הערך הסופי מיד
      return;
    }

    let raf = 0;
    let started = false;
    const run = () => {
      started = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(Math.round(value * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    setShown(0);
    const io = new IntersectionObserver(
      (entries) => {
        if (!started && entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration, calm]);

  return <span ref={ref}>{shown.toLocaleString("he-IL")}</span>;
}
