"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import s from "@/app/home.module.css";

/* האטה חדה: פותחת במהירות ונעצרת בכבדות, כמו משקל שנוחת */
const SLAM = [0.16, 1, 0.3, 1] as const;

/* ציר הזמן (בשניות) */
const T_HELLO = 0.2; // "שלום רחל," (רק למחוברת) נחתת ראשונה
const HELLO_SHIFT = 0.7; // כשיש ברכה אישית כל השאר מוזז אחריה
const T_STAMP = 0.25; // "ברוכה הבאה" נחתת מגדול
const T_NAME = 1.2; // "ללו״ז העניין," נחתת בכבדות
const T_SMALL = 2.1; // "הבית לחומרי הבגרות!" נכנסת בתנופה מהצד
const T_SWOOSH = 2.9; // שני הקווים נמשכים מתחת במהירות

const GOLD = "217,164,65";

/** מילה שנחתת: גדולה ומטושטשת, מתכווצת במהירות לגודלה ונחתכת חד */
function Slam({
  children,
  delay,
  from = 2.3,
  duration = 0.8,
  glow = false,
  glowDelay = 0,
}: {
  children: string;
  delay: number;
  from?: number;
  duration?: number;
  glow?: boolean;
  glowDelay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <span style={{ display: "inline-block" }}>{children}</span>;
  return (
    <motion.span
      style={{ display: "inline-block", transformOrigin: "50% 70%" }}
      initial={{ opacity: 0, scale: from, filter: "blur(16px)" }}
      animate={{
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        ...(glow
          ? {
              textShadow: [
                `0 0 0px rgba(${GOLD},0)`,
                `0 0 34px rgba(${GOLD},0.95)`,
                `0 0 0px rgba(${GOLD},0)`,
              ],
            }
          : {}),
      }}
      transition={{
        opacity: { duration: duration * 0.5, ease: "easeOut", delay },
        scale: { duration, ease: SLAM, delay },
        filter: { duration, ease: SLAM, delay },
        textShadow: { duration: 1.1, ease: "easeOut", delay: glowDelay, times: [0, 0.25, 1] },
      }}
    >
      {children}
    </motion.span>
  );
}

/** מילה שנכנסת בתנופה מהצד מאחורי טשטוש תנועה */
function Swipe({ children, delay, fromX = 70 }: { children: string; delay: number; fromX?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <span style={{ display: "inline-block" }}>{children}</span>;
  return (
    <motion.span
      style={{ display: "inline-block" }}
      initial={{ opacity: 0, x: fromX, filter: "blur(10px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{
        opacity: { duration: 0.35, ease: "easeOut", delay },
        x: { duration: 0.95, ease: SLAM, delay },
        filter: { duration: 0.95, ease: SLAM, delay },
      }}
    >
      {children}
    </motion.span>
  );
}

/** כותרת הירו: ברכת פתיחה, שם האתר והסלוגן. נחיתות כבדות ואז תנופה מהצד. */
export function HeroTitle({ name }: { name?: string }) {
  const reduce = useReducedMotion();
  const shift = name ? HELLO_SHIFT : 0;
  const tStamp = T_STAMP + shift;
  const tName = T_NAME + shift;
  const tSmall = T_SMALL + shift;
  const tSwoosh = T_SWOOSH + shift;
  const pathRef = useRef<SVGPathElement>(null);
  const progress = useMotionValue(0);

  // העט עוקב אחרי נקודת הקצה של הקו שמצויר (קצה הפן = הנקודה); המיקום באחוזים מתוך תיבת ה-SVG (280×24)
  const pointAt = (v: number) => {
    const el = pathRef.current;
    return el ? el.getPointAtLength(v * el.getTotalLength()) : { x: 278, y: 8 };
  };
  const penLeft = useTransform(progress, (v) => `${(pointAt(v).x / 280) * 100}%`);
  const penTop = useTransform(progress, (v) => `${(pointAt(v).y / 24) * 100}%`);
  const penOpacity = useTransform(progress, [0, 0.04, 0.93, 1], [0, 1, 1, 0]);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(progress, 1, { duration: 1.4, delay: tSwoosh, ease: [0.45, 0.05, 0.3, 1] });
    return () => controls.stop();
  }, [reduce, progress, tSwoosh]);

  return (
    <h1 className={s.h1}>
      {name && (
        <span className={s.hello}>
          <Slam delay={T_HELLO} from={2.2}>
            {`שלום ${name},`}
          </Slam>
        </span>
      )}
      <motion.span
        className={s.stamp}
        initial={reduce ? false : { letterSpacing: "0.3em" }}
        animate={{ letterSpacing: "0em" }}
        transition={{ duration: 1.4, ease: SLAM, delay: tStamp }}
      >
        <Slam delay={tStamp} from={2.6}>
          ברוכה
        </Slam>{" "}
        <Slam delay={tStamp + 0.24} from={2.6}>
          הבאה
        </Slam>
      </motion.span>
      <span>
        <Slam delay={tName} from={3.4} duration={0.95} glow glowDelay={tName + 0.5}>
          ללו״ז העניין,
        </Slam>
      </span>
      <span className={s.small}>
        <Swipe delay={tSmall}>הבית</Swipe> <Swipe delay={tSmall + 0.14}>לחומרי</Swipe>{" "}
        <Swipe delay={tSmall + 0.28}>הבגרות!</Swipe>
      </span>
      <span className={s.swoosh} aria-hidden>
        <svg viewBox="0 0 280 24" xmlns="http://www.w3.org/2000/svg">
          {/* קו אחד, מצויר מימין לשמאל (כמו כתיבה בעברית) – העט מצייר אותו */}
          <motion.path
            ref={pathRef}
            d="M278 8C232 -4 186 -4 140 8C94 20 48 20 2 8"
            style={{ pathLength: reduce ? 1 : progress }}
          />
        </svg>
        {!reduce && (
          <motion.img
            src="/images/hero-pen-draw.webp"
            alt=""
            width={256}
            height={264}
            className={s.drawPen}
            style={{ left: penLeft, top: penTop, opacity: penOpacity }}
          />
        )}
      </span>
    </h1>
  );
}
