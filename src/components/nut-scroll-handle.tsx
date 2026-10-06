"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCalm } from "@/lib/calm-mode";

const TOP_MARGIN = 90; // מרווח קבוע מתחת לכותרת העליונה של האתר
const BOTTOM_MARGIN = 24;
// צמוד יחסית לקצה המסך בכוונה: כך נשאר מרווח גדול יותר בין האגוז לטקסט,
// והאגוז לא עולה על הטקסט גם כשהוא גדל בלחיצה (scale 1.15)
const RIGHT_MARGIN = 4;
const HIT_SIZE = 52; // אזור אחיזה נוח לגרירה
const ICON_SIZE = 34; // גודל האגוז המוצג בפועל
const MIN_SCROLLABLE = 400; // לא מציגים ציר בדפים קצרים מדי
const MIN_SCROLLABLE_X = 24; // לא מציגים ציר אופקי כשאין ממש מה לגלול לצדדים
const HINT_TEXT = "גלגלי אותי ותגלי מה יש לנו להציע";
const HINT_MS = 9000; // כמה זמן הטולטיפ נשאר פתוח אם לא נגעו בכלום

function getMaxScroll() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

export function NutScrollHandle() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [percent, setPercent] = useState(0); // 0 = למעלה, 1 = למטה

  // דף הבית: האגוז נכנס באנימציה, ובסיומה נפתח טולטיפ שמזמין לגלול (פעם אחת בכל כניסה לדף)
  const isHome = usePathname() === "/";
  const [introDone, setIntroDone] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [hovered, setHovered] = useState(false); // ריחוף עכבר: אותו טולטיפ מעוצב במקום ה-title הרגיל של הדפדפן
  const hintUsed = useRef(false);
  const calm = useCalm(); // "אני מסוחררת": אין אנימציית פתיחה לחכות לה

  const syncFromScroll = useCallback(() => {
    const max = getMaxScroll();
    setVisible(max > MIN_SCROLLABLE);
    setPercent(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
  }, []);

  const closeHint = useCallback(() => {
    hintUsed.current = true;
    setHintOpen(false);
  }, []);

  // יוצאים מדף הבית – מאפסים, כדי שבחזרה אליו האנימציה והטולטיפ יופיעו שוב
  useEffect(() => {
    if (isHome) return;
    setIntroDone(false);
    setHintOpen(false);
    hintUsed.current = false;
  }, [isHome]);

  // בלי תנועה (העדפת משתמש) אין אנימציה שתסתיים, אז מדלגים עליה
  useEffect(() => {
    if (!isHome || !visible || introDone) return;
    if (calm || window.matchMedia("(prefers-reduced-motion: reduce)").matches) setIntroDone(true);
  }, [isHome, visible, introDone, calm]);

  // פותחים את הטולטיפ רק אחרי שאנימציות דף הבית נגמרו: אם יש הודעה מיוחדת – אחרי שהיא נעלמה ודף הבית
  // התחיל מחדש ושוב סיים; אם אין – כשהכיתוב האחרון בדף (פסקת הפתיחה) סיים להיכתב
  useEffect(() => {
    if (!isHome || !introDone || hintUsed.current) return;
    let openTimer = 0;
    let closeTimer = 0;
    const open = () => {
      setHintOpen(true);
      closeTimer = window.setTimeout(closeHint, HINT_MS);
    };
    const poll = window.setInterval(() => {
      const d = document.documentElement.dataset;
      if (d.homePopup || !d.homeLeadDone) return;
      window.clearInterval(poll);
      if (window.scrollY > 12) return; // כבר התחילה לגלול – אין צורך להזמין
      openTimer = window.setTimeout(open, 600);
    }, 250);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
  }, [isHome, introDone, closeHint]);

  // ברגע שהגולל/ת התחיל/ה לגלול (או לחץ/ה מקש) – הטולטיפ עשה את שלו
  useEffect(() => {
    if (!hintOpen) return;
    const onScroll = () => {
      if (window.scrollY > 12) closeHint();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", closeHint, { passive: true });
    window.addEventListener("keydown", closeHint);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", closeHint);
      window.removeEventListener("keydown", closeHint);
    };
  }, [hintOpen, closeHint]);

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
      closeHint();

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
    [percentFromClientY, closeHint]
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
          onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
          onPointerLeave={() => setHovered(false)}
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
            className={`pointer-events-none block drop-shadow-md transition-transform${
              isHome && !introDone ? " nut-intro" : ""
            }`}
            style={{ width: ICON_SIZE, height: ICON_SIZE, transform: dragging ? "scale(1.15)" : "scale(1)" }}
            onAnimationEnd={() => setIntroDone(true)}
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

          {/* טולטיפ ההזמנה לגלול: נפתח מצד שמאל של האגוז, בכתב גברת לוין */}
          <span
            aria-hidden
            dir="rtl"
            className={`nut-hint${hintOpen || (hovered && !dragging) ? " nut-hint-on" : ""}`}
          >
            <span className="nut-hint-text">{HINT_TEXT}</span>
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
  const [canScroll, setCanScroll] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [percent, setPercent] = useState(0); // 0 = קצה ההתחלה (ימין), 1 = הקצה הרחוק (שמאל)

  const getTarget = useCallback(() => document.querySelector<HTMLElement>(targetSelector), [targetSelector]);

  const getMaxScrollX = useCallback(() => {
    const el = getTarget();
    if (!el) return 0;
    return Math.max(0, el.scrollWidth - el.clientWidth);
  }, [getTarget]);

  // מוצג רק כשהתרשים באמת רחב מהמסך וצריך להזיז כדי להמשיך לראות אותו
  const syncFromScroll = useCallback(() => {
    const el = getTarget();
    const max = getMaxScrollX();
    setCanScroll(max > MIN_SCROLLABLE_X);
    setPercent(el && max > 0 ? Math.min(1, Math.max(0, Math.abs(el.scrollLeft) / max)) : 0);
  }, [getTarget, getMaxScrollX]);

  useEffect(() => {
    let el: HTMLElement | null = null;
    let raf = 0;
    let findRaf = 0;
    let tries = 0;

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncFromScroll();
      });
    };

    const ro = new ResizeObserver(schedule);
    // פתיחה/סגירה של ענפים משנה את רוחב התוכן בלי אירוע scroll/resize ובלי לשנות את גודל המיכל
    const mo = new MutationObserver(schedule);

    const attach = () => {
      findRaf = 0;
      el = getTarget();
      if (!el) {
        if (tries++ < 60) findRaf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener("scroll", schedule, { passive: true });
      ro.observe(el);
      mo.observe(el, { childList: true, subtree: true, attributes: true });
      syncFromScroll();
    };

    attach();
    window.addEventListener("resize", schedule);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (findRaf) cancelAnimationFrame(findRaf);
      el?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      mo.disconnect();
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

  if (!canScroll) return null;

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
