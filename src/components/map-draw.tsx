"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import s from "./map-draw.module.css";

/**
 * תרשים מפת הבגרויות שמצויר "מול העיניים" כשהוא נכנס לתצוגה: ריבוע, קו, ריבוע, קו…
 * שתי שכבות תמונה (ריבועים / קווים) נחשפות דרך מסיכות SVG:
 *  - ריבוע: מסיכה שנמתחת מימין לשמאל, כמו משיכת מרקר;
 *  - קו: מסיכה עבה לאורך מסלול הקו שמתארכת, כמו עט שמושך אותו.
 * ברירת המחדל גלויה (SSR / בלי JS / מפחיתי-תנועה) – ההסתרה והאנימציה מופעלות רק אחרי טעינה.
 */

// קואורדינטות בתוך אזור התמונה (760×440)
const BOXES = [
  { x: 156, y: 4, w: 176, h: 104 }, // סגול
  { x: 11, y: 130, w: 176, h: 104 }, // טורקיז
  { x: 360, y: 137, w: 178, h: 104 }, // כחול
  { x: 566, y: 291, w: 176, h: 99 }, // ורוד
  { x: 253, y: 329, w: 177, h: 104 }, // צהוב
];
const LINES = [
  "M150,46 L118,46 Q100,48 99,70 L97,123",
  "M252,108 L253,158 Q256,180 278,182 L350,189",
  "M537,179 L605,178 Q620,180 623,200 L628,282",
  "M447,246 Q445,270 410,272 L345,272 Q327,274 326,300 L326,322",
];
// סדר הציור: ריבוע0, קו0, ריבוע1, קו1, ריבוע2, קו2, ריבוע3, קו3, ריבוע4
const BOX_AT = [0, 0.9, 1.8, 2.7, 3.6];
const LINE_AT = [0.5, 1.4, 2.3, 3.2];
const BOX_DUR = 0.5;
const LINE_DUR = 0.4;

export function MapDraw({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"idle" | "armed" | "drawing">("idle");

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPhase("armed");
  }, []);

  useEffect(() => {
    if (phase !== "armed") return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setPhase("drawing");
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [phase]);

  return (
    <div
      ref={ref}
      className={`${s.root} ${phase === "armed" ? s.armed : ""} ${phase === "drawing" ? s.drawing : ""} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 760 440" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {BOXES.map((b, i) => (
            <mask key={`mb${i}`} id={`map-mb${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="760" height="440">
              <rect
                className={s.boxWipe}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill="#fff"
                style={{ animationDelay: `${BOX_AT[i]}s`, animationDuration: `${BOX_DUR}s` }}
              />
            </mask>
          ))}
          {LINES.map((d, i) => (
            <mask key={`ml${i}`} id={`map-ml${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="760" height="440">
              <path
                className={s.lineDraw}
                d={d}
                pathLength={1}
                fill="none"
                stroke="#fff"
                strokeWidth={16}
                strokeLinecap="round"
                style={{ animationDelay: `${LINE_AT[i]}s`, animationDuration: `${LINE_DUR}s` }}
              />
            </mask>
          ))}
        </defs>
        {BOXES.map((_, i) => (
          <image key={`b${i}`} href="/images/map-boxes.webp" width="760" height="440" mask={`url(#map-mb${i})`} />
        ))}
        {LINES.map((_, i) => (
          <image key={`l${i}`} href="/images/map-lines.webp" width="760" height="440" mask={`url(#map-ml${i})`} />
        ))}
      </svg>
    </div>
  );
}
