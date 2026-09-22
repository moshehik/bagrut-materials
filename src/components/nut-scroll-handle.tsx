"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const TOP_MARGIN = 90; // מרווח קבוע מתחת לכותרת העליונה של האתר
const BOTTOM_MARGIN = 24;
const RIGHT_MARGIN = 16;
const HIT_SIZE = 52; // אזור אחיזה נוח לגרירה
const ICON_SIZE = 28; // גודל האגוז המוצג בפועל
const MIN_SCROLLABLE = 400; // לא מציגים ציר בדפים קצרים מדי

function getMaxScroll() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

export function NutScrollHandle() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [percent, setPercent] = useState(0); // 0 = למעלה, 1 = למטה

  const syncFromScroll = useCallback(() => {
    const max = getMaxScroll();
    setVisible(max > MIN_SCROLLABLE);
    setPercent(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
  }, []);

  useEffect(() => {
    syncFromScroll();
    window.addEventListener("scroll", syncFromScroll, { passive: true });
    window.addEventListener("resize", syncFromScroll);

    // תוכן שמשתנה בגובה (פתיחת ענפים בעץ המפה וכו') בלי אירוע scroll/resize
    const ro = new ResizeObserver(() => syncFromScroll());
    ro.observe(document.body);

    return () => {
      window.removeEventListener("scroll", syncFromScroll);
      window.removeEventListener("resize", syncFromScroll);
      ro.disconnect();
    };
  }, [syncFromScroll]);

  const percentFromClientY = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const usable = rect.height - HIT_SIZE;
    const y = clientY - rect.top - HIT_SIZE / 2;
    return usable > 0 ? Math.min(1, Math.max(0, y / usable)) : 0;
  }, []);

  const onThumbPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragging(true);

      // כיבוי זמני של scroll-behavior: smooth הגלובלי — הוא זה שגרם לקפיצות בגרירה
      const html = document.documentElement;
      const prevScrollBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";

      let raf = 0;
      let pendingY: number | null = null;
      const apply = () => {
        raf = 0;
        if (pendingY === null) return;
        const p = percentFromClientY(pendingY);
        pendingY = null;
        setPercent(p);
        window.scrollTo({ top: p * getMaxScroll(), behavior: "auto" });
      };
      const move = (ev: PointerEvent) => {
        pendingY = ev.clientY;
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const up = () => {
        setDragging(false);
        if (raf) cancelAnimationFrame(raf);
        html.style.scrollBehavior = prevScrollBehavior;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [percentFromClientY]
  );

  if (!visible) return null;

  return (
    <div
      className="fixed z-40 hidden sm:block"
      style={{ top: TOP_MARGIN, bottom: BOTTOM_MARGIN, right: RIGHT_MARGIN, width: HIT_SIZE }}
      dir="ltr"
    >
      <div ref={trackRef} className="relative h-full w-full">
        {/* הציר עצמו — פס מודרני דק בכחול */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 rounded-full"
          style={{
            left: "50%",
            width: 4,
            transform: "translateX(-50%)",
            background: "linear-gradient(180deg, var(--color-sea, #33456e), var(--color-sea2, #212f4d))",
            boxShadow: "0 0 0 1px rgba(51,69,110,0.12), 0 0 10px rgba(51,69,110,0.25)",
          }}
        />

        {/* האגוז הנגרר */}
        <button
          type="button"
          onPointerDown={onThumbPointerDown}
          aria-label="גררי למעלה או למטה כדי לגלול בדף"
          title="גררי כדי לגלול בדף"
          className="absolute grid place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-gold/50"
          style={{
            width: HIT_SIZE,
            height: HIT_SIZE,
            left: "50%",
            transform: "translateX(-50%)",
            top: `calc(${percent * 100}% * (1 - ${HIT_SIZE}px / 100%))`,
            cursor: dragging ? "grabbing" : "grab",
            transition: dragging ? "none" : "top 0.12s var(--ease-snap, ease-out)",
          }}
        >
          <span
            className="pointer-events-none block drop-shadow-md transition-transform"
            style={{ width: ICON_SIZE, height: ICON_SIZE, transform: dragging ? "scale(1.15)" : "scale(1)" }}
          >
            <Image
              src="/images/nut-handle.png"
              alt=""
              width={112}
              height={109}
              className="h-full w-full object-contain select-none"
              draggable={false}
              priority={false}
            />
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * גרסה אופקית — לגלילה שמאל/ימין בתוך אזור צר עם תוכן רחב (כמו תרשים המפה),
 * ולא בדף כולו. מחפש אלמנט עם overflow-x בעל התכונה data-map-scroll-x.
 */
export function NutScrollHandleHorizontal({
  targetSelector = "[data-map-scroll-x]",
}: {
  targetSelector?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [percent, setPercent] = useState(0); // 0 = קצה ההתחלה (ימין), 1 = הקצה הרחוק (שמאל)

  const getTarget = useCallback(() => document.querySelector<HTMLElement>(targetSelector), [targetSelector]);

  const getMaxScrollX = useCallback(() => {
    const el = getTarget();
    if (!el) return 0;
    return Math.max(0, el.scrollWidth - el.clientWidth);
  }, [getTarget]);

  // מוצג תמיד בעמוד המפה — גם אם כרגע אין מה לגלול, כדי שיהיה עקבי וברור שהוא שם
  const syncFromScroll = useCallback(() => {
    const el = getTarget();
    const max = getMaxScrollX();
    setMounted(true);
    setPercent(el && max > 0 ? Math.min(1, Math.max(0, Math.abs(el.scrollLeft) / max)) : 0);
  }, [getTarget, getMaxScrollX]);

  useEffect(() => {
    const el = getTarget();
    syncFromScroll();
    el?.addEventListener("scroll", syncFromScroll, { passive: true });
    window.addEventListener("resize", syncFromScroll);

    const ro = new ResizeObserver(() => syncFromScroll());
    if (el) ro.observe(el);

    return () => {
      el?.removeEventListener("scroll", syncFromScroll);
      window.removeEventListener("resize", syncFromScroll);
      ro.disconnect();
    };
  }, [getTarget, syncFromScroll]);

  const percentFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const usable = rect.width - HIT_SIZE;
    const x = clientX - rect.left - HIT_SIZE / 2;
    return usable > 0 ? Math.min(1, Math.max(0, 1 - x / usable)) : 0;
  }, []);

  const applyPercent = useCallback(
    (p: number) => {
      const el = getTarget();
      if (!el) return;
      const max = getMaxScrollX();
      // התחלת התוכן היא בימין (RTL): scrollLeft הולך מ-0 עד -max
      el.scrollLeft = -p * max;
    },
    [getTarget, getMaxScrollX]
  );

  const onThumbPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragging(true);

      let raf = 0;
      let pendingX: number | null = null;
      const apply = () => {
        raf = 0;
        if (pendingX === null) return;
        const p = percentFromClientX(pendingX);
        pendingX = null;
        setPercent(p);
        applyPercent(p);
      };
      const move = (ev: PointerEvent) => {
        pendingX = ev.clientX;
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const up = () => {
        setDragging(false);
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [percentFromClientX, applyPercent]
  );

  if (!mounted) return null;

  return (
    <div className="mx-auto mb-2 h-[52px] max-w-md" dir="ltr">
      <div ref={trackRef} className="relative h-full w-full">
        {/* הציר עצמו — פס מודרני דק בכחול, אופקי */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 rounded-full"
          style={{
            top: "50%",
            height: 4,
            transform: "translateY(-50%)",
            background: "linear-gradient(90deg, #212f4d, #33456e)",
            boxShadow: "0 0 0 1px rgba(51,69,110,0.12), 0 0 10px rgba(51,69,110,0.25)",
          }}
        />

        {/* האגוז הנגרר */}
        <button
          type="button"
          onPointerDown={onThumbPointerDown}
          aria-label="גררי ימינה או שמאלה כדי לגלול בתרשים"
          title="גררי כדי לגלול בתרשים"
          className="absolute grid place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-gold/50"
          style={{
            width: HIT_SIZE,
            height: HIT_SIZE,
            top: "50%",
            transform: "translateY(-50%)",
            left: `calc(${(1 - percent) * 100}% * (1 - ${HIT_SIZE}px / 100%))`,
            cursor: dragging ? "grabbing" : "grab",
            transition: dragging ? "none" : "left 0.12s var(--ease-snap, ease-out)",
          }}
        >
          <span
            className="pointer-events-none block drop-shadow-md transition-transform"
            style={{ width: ICON_SIZE, height: ICON_SIZE, transform: dragging ? "scale(1.15)" : "scale(1)" }}
          >
            <Image
              src="/images/nut-handle.png"
              alt=""
              width={112}
              height={109}
              className="h-full w-full object-contain select-none"
              draggable={false}
              priority={false}
            />
          </span>
        </button>
      </div>
    </div>
  );
}
