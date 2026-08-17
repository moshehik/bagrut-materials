"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * רשת עם כניסה מדורגת (stagger) של הילדים – לשימוש ברכיבי שרת:
 * <AnimatedGrid className="grid ..."> {items.map(...)} </AnimatedGrid>
 */
export function AnimatedGrid({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode[] | ReactNode;
  className?: string;
  delay?: number;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: delay } },
      }}
    >
      {items.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: 18, scale: 0.97 },
            show: {
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { type: "spring", stiffness: 260, damping: 24 },
            },
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** בלוק בודד שנכנס בעדינות כשמגיעים אליו בגלילה */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
