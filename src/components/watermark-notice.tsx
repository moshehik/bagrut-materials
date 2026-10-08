"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { FingerprintPattern } from "lucide-react";
import { useCalm } from "@/lib/calm-mode";
import styles from "./watermark-notice.module.css";

const TEXT =
  "כל קובץ מוטבע בכתב שקוף בפרטי המורה ובהודעת זכויות יוצרים, כדי להגן על היוצרות ועל המחירים הנמוכים. החומר נועד לשימושך האישי, ותודה שאת שומרת עליו.";
const CHAR_MS = 32; // ms לאות

/**
 * נוסח ההודעה נכתב אות-אות ברגע שהוא נכנס לשדה הראייה.
 * מקום הטקסט שמור מראש (החלק שטרם נכתב שקוף) כדי שהפריסה לא תקפוץ.
 */
export function WatermarkText({ className }: { className?: string }) {
  const calm = useCalm();
  const reduce = !!useReducedMotion() || calm;
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduce) {
      setCount(TEXT.length);
      return;
    }
    if (!inView) return;
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= TEXT.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, CHAR_MS);
    return () => clearInterval(id);
  }, [inView, reduce]);

  const done = count >= TEXT.length;

  return (
    <span ref={ref} className={`${styles.text} ${className ?? ""}`} aria-label={TEXT}>
      <span aria-hidden="true">
        {TEXT.slice(0, count)}
        {inView && !done && <span className={styles.caret} />}
        <span className={styles.rest}>{TEXT.slice(count)}</span>
      </span>
    </span>
  );
}

/** סימן טביעת אצבע עם קו סריקה — מחליף את סמל המגן */
export function FingerprintMark({ className }: { className?: string }) {
  return (
    <span className={`${styles.print} ${className ?? ""}`} aria-hidden="true">
      <FingerprintPattern strokeWidth={1.5} />
      <span className={styles.scan} />
    </span>
  );
}
