"use client";

import { useEffect, useState } from "react";
import s from "@/app/home.module.css";

/** מחוגי השעון שבלוגו בתמונת הפתיח – מראים את השעה האמיתית אצל הגולשת ונעים בזמן אמת.
 *  התמונה עצמה (hero-intro-noclockhands.webp) בלי מחוגים; המיקום והגודל ב-.heroClock (home.module.css). */
export function HeroClock() {
  // null עד שהרכיב עולה בדפדפן: אין התאמה מול השרת, והמחוגים נכנסים בעדינות
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const sec = now ? now.getSeconds() : 0;
  const min = now ? now.getMinutes() + sec / 60 : 0;
  const hour = now ? (now.getHours() % 12) + min / 60 : 0;

  return (
    <span className={s.heroClock} aria-hidden data-ready={now ? "true" : undefined}>
      <svg viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg">
        <g className={s.clockHand} style={{ transform: `rotate(${hour * 30}deg)` }}>
          <line x1="130" y1="140" x2="130" y2="66" stroke="#26344a" strokeWidth="6" strokeLinecap="round" />
        </g>
        <g className={s.clockHand} style={{ transform: `rotate(${min * 6}deg)` }}>
          <line x1="130" y1="142" x2="130" y2="20" stroke="#26344a" strokeWidth="4" strokeLinecap="round" />
        </g>
        <g className={`${s.clockHand} ${s.clockSecond}`} style={{ transform: `rotate(${sec * 6}deg)` }}>
          <line x1="130" y1="150" x2="130" y2="14" stroke="#d9a441" strokeWidth="2" strokeLinecap="round" />
        </g>
        <circle cx="130" cy="130" r="9" fill="#26344a" />
        <circle cx="130" cy="130" r="3.5" fill="#d9a441" />
      </svg>
    </span>
  );
}
