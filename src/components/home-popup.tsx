"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";

/** רגע קצר אחרי שהאנימציה של דף הבית נגמרה, לפני שההודעה מופיעה */
const AFTER_ANIM_MS = 600;
/** רשת ביטחון: אם האנימציה לא מסמנת שנגמרה, ההודעה מופיעה בכל זאת אחרי הזמן הזה */
const MAX_WAIT_MS = 20000;
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
    segs.push({ text: head, cls: many ? "hp-head hp-head-nut" : "hp-head", nut: many });
    const body = rest.join("\n").trim();
    if (body) segs.push({ text: body, cls: "hp-body" });
  }
  return segs;
}

/**
 * עוטף את דף הבית. הודעה בדף הבית (מקצוע חדש, קופונים חדשים וכו') מופיעה אחרי שהאנימציות של דף הבית נגמרו:
 * אז קופץ מעליו כרטיס ההודעה (public/images/home-popup-card.webp) והטקסט נכתב עליו אות-אחר-אות בכחול האתר
 * בכתב גברת לוין. ההודעה נשארת כל עוד האותיות נכתבות, ומיד אחרי שהסתיימו (ועוד רגע לקריאה) היא נעלמת –
 * ורק אז נפתח הטולטיפ של גלילת האגוז (NutScrollHandle מחכה ל-data-home-popup שייעלם).
 * מופיעה בכל כניסה לדף. אפשר גם לסגור ב-X / Esc / לחיצה על הרקע. העיצוב בקלאסים .hp-* ב-globals.css.
 */
export function HomePopup({ data, children }: { data: HomePopupData; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const segs = useMemo(() => buildSegments(data), [data]);
  const total = useMemo(() => segs.reduce((n, s) => n + s.text.length, 0), [segs]);

  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [count, setCount] = useState(0);

  // ההודעה מופיעה רק אחרי שאנימציות דף הבית נגמרו (הכיתוב האחרון, פסקת הפתיחה, סיים להיכתב)
  // ואם מישהי התחילה לגלול ולא חיכתה לאנימציה – ההודעה קופצת לה מיד
  useEffect(() => {
    const started = Date.now();
    let after = 0;
    const stopWaiting = () => {
      clearInterval(poll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onNudge);
      window.removeEventListener("touchmove", onNudge);
    };
    const showNow = () => {
      stopWaiting();
      setShown(true);
    };
    const onScroll = () => {
      if (window.scrollY > 12) showNow();
    };
    const onNudge = () => showNow();
    const poll = setInterval(() => {
      const done = !!document.documentElement.dataset.homeLeadDone;
      if (!done && Date.now() - started < MAX_WAIT_MS) return;
      stopWaiting();
      after = window.setTimeout(() => setShown(true), AFTER_ANIM_MS);
    }, 200);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onNudge, { passive: true });
    window.addEventListener("touchmove", onNudge, { passive: true });
    onScroll(); // כבר גללה לפני שהדף סיים להיטען
    return () => {
      stopWaiting();
      clearTimeout(after);
    };
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
      <div className="overflow-x-clip">
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
            <button type="button" className="hp-close" aria-label="סגירה" onClick={dismiss}>
              <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
              </svg>
            </button>
            <div className="hp-text" aria-hidden>
              {/* מקום שמור ללוגו שבפינה השמאלית-תחתונה של הכרטיס: הטקסט עוטף אותו */}
              <span className="hp-logo-gap-top" />
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
