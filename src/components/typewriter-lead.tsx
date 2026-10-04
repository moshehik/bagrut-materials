"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const START_DELAY = 5000; // ms — מתחיל כשהכותרת כמעט סיימה להיכנס (הקווים התחתונים עדיין נמשכים)
const CHAR_MS = 34; // ms לאות — קצב כתיבה טבעי

/** פסקת הפתיחה מוקלדת אות-אות, כאילו מישהי כותבת אותה עכשיו. */
export function TypewriterLead({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!reduce) return;
    setStarted(true);
    setCount(text.length);
  }, [reduce, text]);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setStarted(true), START_DELAY);
    return () => clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    if (reduce || !started) return;
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, CHAR_MS);
    return () => clearInterval(id);
  }, [started, reduce, text]);

  const done = count >= text.length;

  return (
    <p className={className} aria-label={text}>
      <span aria-hidden="true">
        <span data-gold-reveal="true" data-done={done ? "true" : undefined}>
          {text.slice(0, count)}
        </span>
        {started && !done && <span data-cursor="true" />}
      </span>
    </p>
  );
}
