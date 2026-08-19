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
        show: { transition: { staggerChildren: 0.05, delayChildren: delay } },
      }}
    >
      {items.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: 10 },
            show: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
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
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
