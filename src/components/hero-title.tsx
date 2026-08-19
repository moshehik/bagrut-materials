"use client";

import { motion, useReducedMotion } from "motion/react";
import s from "@/app/home.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;
const STEP = 0.12;
const START = 0.1;

function Word({
  children,
  index,
  className,
  driftX = 0,
}: {
  children: string;
  index: number;
  className?: string;
  driftX?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={className}
      style={{ display: "inline-block" }}
      initial={reduce ? false : { opacity: 0, x: -driftX, y: 20, rotate: -4, filter: "blur(3px)" }}
      animate={{ opacity: 1, x: driftX, y: 0, rotate: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: EASE, delay: reduce ? 0 : START + index * STEP }}
    >
      {children}
    </motion.span>
  );
}

/** כותרת הירו: המילים "נכתבות" פנימה אחת-אחת, ואז "העז" מסומנת במרקר. */
export function HeroTitle() {
  const reduce = useReducedMotion();

  return (
    <h1 className={s.h1}>
      <span>
        <Word index={0}>הגיע</Word>{" "}
        <Word index={1} className={s.black}>
          הזמן,
        </Word>
      </span>
      <span>
        <Word index={2}>להוציא</Word> <Word index={3}>את</Word>{" "}
        <Word index={4} className={s.green} driftX={22}>
          העז
        </Word>
      </span>
      <span>
        <Word index={5} driftX={-22}>
          מהלו״ז.
        </Word>
      </span>
    </h1>
  );
}
