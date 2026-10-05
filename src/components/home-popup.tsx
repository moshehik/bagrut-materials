"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";

/** כמה זמן דף הבית נראה לבד, לפני שההודעה מופיעה מעליו */
const DELAY_MS = 3000;
/** ms לאות – קצב כתיבה בכתב יד */
const CHAR_MS = 55;
/** כמה זמן ההודעה נשארת אחרי שהאותיות סיימו להיכתב (כדי להספיק לקרוא), ואז נעלמת */
const HOLD_MS = 2200;
const FADE_MS = 500;

export type HomePopupData = {
  title: string;
  /** כל פריט = הודעה אחת; השורה הראשונה בו היא הכותרת והשאר הטקסט */
  items: string[];
};

type Seg = { text: string; cls: string; nut?: boolean };

function buildSegments(d: HomePopupData): Seg[] {
  const segs: Seg[] = [{ text: d.title || "יש חדש באתר!", cls: "hp-title" }];
  const many = d.items.length > 1;
  for (const item of d.items) {
    const [head, ...rest] = item.split("\n");
    // כשיש כמה הודעות – אגוז מסתובב בתחילת כל אחת
    segs.push({ text: head, cls: "hp-head", nut: many });
    const body = rest.join("\n").trim();
    if (body) segs.push({ text: body, cls: "hp-body" });
  }
  return segs;
}

/**
 * עוטף את דף הבית. הודעה בדף הבית (מקצוע חדש, קופונים חדשים וכו') מופיעה במקביל לדף שנפתח:
 * קודם דף הבית עושה את האנימציות שלו 3 שניות, ואז קופץ מעליו כרטיס ההודעה (public/images/home-popup-card.webp)
 * והטקסט נכתב עליו אות-אחר-אות בכחול האתר בכתב גברת לוין. ההודעה נשארת כל עוד האותיות נכתבות, ומיד אחרי
 * שהסתיימו (ועוד רגע לקריאה) היא נעלמת – ובאותו רגע דף הבית מתחיל את האנימציות שלו מחדש (remount לפי epoch).
 * מופיעה בכל כניסה לדף. אפשר גם לסגור ב-Esc / לחיצה על הרקע. העיצוב בקלאסים .hp-* ב-globals.css.
 */
export function HomePopup({ data, children }: { data: HomePopupData; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const segs = useMemo(() => buildSegments(data), [data]);
  const total = useMemo(() => segs.reduce((n, s) => n + s.text.length, 0), [segs]);

  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [count, setCount] = useState(0);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // מסמן ל-NutScrollHandle שיש הודעה פעילה, כדי שטולטיפ האגוז ימתין עד שהיא נעלמת
  useEffect(() => {
    if (gone) return;
    const root = document.documentElement;
    root.dataset.homePopup = "1";
    return () => {
      delete root.dataset.homePopup;
    };
  }, [gone]);

  const dismiss = useCallback(() => {
    setLeaving(true);
    setEpoch((e) => e + 1); // דף הבית מתחיל מחדש את האנימציות שלו, בזמן שההודעה נמוגה
    setTimeout(() => setGone(true), FADE_MS);
  }, []);

  // כתיבת האותיות
  useEffect(() => {
    if (!shown || leaving) return;
    if (reduce) {
      setCount(total);
      return;
    }
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= total) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, CHAR_MS);
    return () => clearInterval(id);
  }, [shown, leaving, reduce, total]);

  // אחרי שכל האותיות נכתבו – רגע לקריאה, ואז ההודעה נעלמת
  useEffect(() => {
    if (!shown || leaving || count < total) return;
    const t = setTimeout(dismiss, HOLD_MS);
    return () => clearTimeout(t);
  }, [shown, leaving, count, total, dismiss]);

  useEffect(() => {
    if (!shown || gone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, gone, dismiss]);

  let left = count; // כמה אותיות עוד "נכתבות" לפני הקטע הנוכחי
  return (
    <>
      <div key={epoch} className="overflow-x-clip">
        {children}
      </div>
      {shown && !gone && (
        <div
          className={`hp-overlay${leaving ? " hp-leaving" : ""}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
        >
          <div className="hp-card" role="dialog" aria-modal="true" aria-label={segs.map((s) => s.text).join(". ")}>
            <div className="hp-text" aria-hidden>
              {/* מקום שמור ללוגו שבפינה השמאלית-תחתונה של הכרטיס: הטקסט עוטף אותו */}
              <span className="hp-logo-gap" />
              {segs.map((s, i) => {
                const n = Math.max(0, Math.min(s.text.length, left));
                left -= s.text.length;
                // המשך הטקסט שעוד לא נכתב נשאר במקומו (נסתר), כדי שמילים לא "יקפצו" בין שורות בזמן הכתיבה
                return (
                  <p key={i} className={s.cls}>
                    {s.nut && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/images/nut-handle.png"
                        alt=""
                        className="hp-nut"
                        style={{ visibility: n > 0 ? "visible" : "hidden" }}
                      />
                    )}
                    {s.text.slice(0, n)}
                    <span className="hp-rest">{s.text.slice(n)}</span>
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
