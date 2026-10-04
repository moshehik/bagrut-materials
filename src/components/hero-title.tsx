"use client";

import { motion, useReducedMotion } from "motion/react";
import s from "@/app/home.module.css";

/* האטה חדה: פותחת במהירות ונעצרת בכבדות, כמו משקל שנוחת */
const SLAM = [0.16, 1, 0.3, 1] as const;

/* ציר הזמן (בשניות) */
const T_STAMP = 0.25; // "הגיע הזמן!" נחתת מגדול
const T_SMALL = 1.45; // "להוציא את" נכנסת בתנופה מהצד
const T_GOAT = 2.55; // שקט קצר, ואז "העז" נחתת בכבדות
const T_LUZ = 3.15; // "מהלו״ז." נכנסת וצמודה אליה
const T_PART = 3.85; // הבזק זהב בתפר, והמילים נפרדות בכוח
const T_SWOOSH = 4.45; // שני הקווים נמשכים מתחת במהירות

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

/** כותרת הירו: נחיתות כבדות, שקט, הבזק זהב ופרידה חדה בין "העז" ל"מהלו״ז". */
export function HeroTitle() {
  const reduce = useReducedMotion();

  return (
    <h1 className={s.h1}>
      <motion.span
        className={s.stamp}
        initial={reduce ? false : { letterSpacing: "0.3em" }}
        animate={{ letterSpacing: "0em" }}
        transition={{ duration: 1.4, ease: SLAM, delay: T_STAMP }}
      >
        <Slam delay={T_STAMP} from={2.6}>
          הגיע
        </Slam>{" "}
        <Slam delay={T_STAMP + 0.24} from={2.6}>
          הזמן!
        </Slam>
      </motion.span>
      <span className={s.small}>
        <Swipe delay={T_SMALL}>להוציא</Swipe> <Swipe delay={T_SMALL + 0.18}>את</Swipe>
      </span>
      <span>
        <Slam delay={T_GOAT} from={3.4} duration={0.95} glow glowDelay={T_PART}>
          העז
        </Slam>
        <motion.span
          aria-hidden
          style={{ display: "inline-block", position: "relative" }}
          initial={reduce ? false : { width: "0.03em" }}
          animate={{ width: "0.34em" }}
          transition={{ duration: 0.85, ease: SLAM, delay: T_PART }}
        >
          {/* הבזק זהב אנכי בתפר, נע עם הרווח הנפתח */}
          {!reduce && (
            <motion.span
              style={{
                position: "absolute",
                left: "50%",
                top: "-8%",
                height: "116%",
                width: 3,
                marginLeft: -1.5,
                borderRadius: 2,
                background: `linear-gradient(to bottom, rgba(${GOLD},0), rgb(${GOLD}) 25%, #f6e3a8 50%, rgb(${GOLD}) 75%, rgba(${GOLD},0))`,
                boxShadow: `0 0 18px 4px rgba(${GOLD},0.75)`,
                transformOrigin: "50% 50%",
              }}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: [0, 1, 1, 0], scaleY: [0, 1, 1, 0.6] }}
              transition={{ duration: 0.95, delay: T_PART - 0.06, times: [0, 0.12, 0.45, 1], ease: "easeOut" }}
            />
          )}
        </motion.span>
        <Slam delay={T_LUZ} from={1.9} duration={0.7}>
          מהלו״ז.
        </Slam>
      </span>
      <span className={s.swoosh} aria-hidden>
        <svg viewBox="0 0 280 24" xmlns="http://www.w3.org/2000/svg">
          <motion.path
            d="M2 8c46 12 92 12 138 0s92-12 138 0"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: SLAM, delay: T_SWOOSH }}
          />
          <motion.path
            d="M2 17c46 11 92 11 138 0s92-11 138 0"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: SLAM, delay: T_SWOOSH + 0.12 }}
          />
        </svg>
      </span>
    </h1>
  );
}
