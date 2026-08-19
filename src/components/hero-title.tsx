"use client";

import { motion, useReducedMotion } from "motion/react";
import s from "@/app/home.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;
const STEP = 0.32;
const START = 0.2;
/* "העז" ו"מהלו״ז" מגיעות אחרי שאר המשפט, שוקטות רגע, ואז קופצות-ונפרדות זו מזו */
const SPLIT_DELAY = START + 4 * STEP + 0.55;

function Word({
  children,
  index,
  className,
  driftX = 0,
  hop = false,
  delayOverride,
}: {
  children: string;
  index: number;
  className?: string;
  driftX?: number;
  hop?: boolean;
  delayOverride?: number;
}) {
  const reduce = useReducedMotion();
  const delay = delayOverride ?? START + index * STEP;
  const spin = index % 2 === 0 ? -10 : 10;

  if (reduce) {
    return (
      <motion.span className={className} style={{ display: "inline-block" }} initial={false} animate={{ opacity: 1, x: 0, y: 0 }}>
        {children}
      </motion.span>
    );
  }

  return (
    <motion.span
      className={className}
      style={{ display: "inline-block", cursor: "default" }}
      whileHover={{
        y: -10,
        rotate: spin < 0 ? 8 : -8,
        scale: 1.1,
        transition: { type: "spring", stiffness: 320, damping: 10 },
      }}
      initial={
        hop
          ? { opacity: 0, x: 0, y: 30, rotate: -6, scale: 0.5, filter: "blur(4px)" }
          : { opacity: 0, x: 0, y: 48, rotate: spin, scale: 0.65, filter: "blur(5px)" }
      }
      animate={
        hop
          ? {
              opacity: 1,
              x: [0, driftX * 0.7, 0],
              y: [30, -34, 0],
              rotate: [-6, driftX > 0 ? 16 : -16, 0],
              scale: [0.5, 1.22, 1],
              filter: "blur(0px)",
            }
          : {
              opacity: 1,
              x: 0,
              y: [48, -10, 0],
              rotate: [spin, spin * -0.3, 0],
              scale: [0.65, 1.08, 1],
              filter: "blur(0px)",
            }
      }
      transition={
        hop
          ? { duration: 1.3, ease: EASE, delay, times: [0, 0.55, 1] }
          : { duration: 1.05, ease: EASE, delay, times: [0, 0.7, 1] }
      }
    >
      {children}
    </motion.span>
  );
}

const SWOOSH_DELAY = SPLIT_DELAY + 0.5;

/** כותרת הירו: המילים "נכתבות" פנימה אחת-אחת, ואז "העז" ו"מהלו״ז" קופצות ונפרדות. */
export function HeroTitle() {
  const reduce = useReducedMotion();

  return (
    <h1 className={s.h1}>
      <span className={s.stamp}>
        <Word index={0}>הגיע</Word> <Word index={1}>הזמן!</Word>
      </span>
      <span className={s.small}>
        <Word index={2}>להוציא</Word> <Word index={3}>את</Word>
      </span>
      <span>
        <Word index={4} driftX={64} hop delayOverride={SPLIT_DELAY}>
          העז
        </Word>{" "}
        <Word index={5} driftX={-56} hop delayOverride={SPLIT_DELAY + 0.2}>
          מהלו״ז.
        </Word>
      </span>
      <motion.span
        className={s.swoosh}
        aria-hidden
        initial={reduce ? false : { opacity: 0, scaleX: 0.6 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : SWOOSH_DELAY }}
      >
        <svg viewBox="0 0 280 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 8c46 12 92 12 138 0s92-12 138 0" />
          <path d="M2 17c46 11 92 11 138 0s92-11 138 0" />
        </svg>
      </motion.span>
    </h1>
  );
}
