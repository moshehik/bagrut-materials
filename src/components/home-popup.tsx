"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** רגע קצר אחרי שהכיתוב הזהב של דף הבית נגמר, לפני שההודעה מופיעה */
const AFTER_ANIM_MS = 600;
/** מי שמתחילה לגלול בלי לחכות לאנימציה: ההודעה מופיעה שנייה אחרי תחילת הגלילה */
const AFTER_SCROLL_MS = 1000;
/** רשת ביטחון בלבד (אם הכיתוב הזהב לא מסמן שנגמר, או שהדף איטי מאוד) */
const MAX_WAIT_MS = 60000;
/** זמן קריאה: בסיס + תוספת לכל אות, ואז ההודעה נעלמת (אפשר גם לסגור מוקדם עם ה-X) */
const READ_BASE_MS = 4000;
const READ_CHAR_MS = 60;
const READ_MAX_MS = 20000;
const FADE_MS = 500;

export type HomePopupData = {
  title: string;
  /** כל פריט = הודעה אחת; השורה הראשונה בו היא הכותרת והשאר הטקסט */
  items: string[];
};

type Seg = { text: string; cls: string; nut?: boolean };

function buildSegments(d: HomePopupData): Seg[] {
  const segs: Seg[] = [{ text: d.title || "יש חדש!", cls: "hp-title" }];
  const many = d.items.length > 1;
  for (const item of d.items) {
    const [head, ...rest] = item.split("\n");
    // כשיש כמה הודעות – אגוז בתחילת כל אחת
    segs.push({ text: head, cls: many ? "hp-head hp-head-nut" : "hp-head", nut: many });
    const body = rest.join("\n").trim();
    if (body) segs.push({ text: body, cls: "hp-body" });
  }
  return segs;
}

/**
 * עוטף את דף הבית. הודעה בדף הבית (מקצוע חדש, קופונים חדשים וכו') מופיעה אחרי שהאנימציות של דף הבית נגמרו:
 * אז קופץ מעליו כרטיס ההודעה (public/images/home-popup-card.webp) והטקסט מופיע עליו במלואו בכחול האתר
 * בכתב גברת לוין. ההודעה נשארת זמן קריאה (לפי אורך הטקסט) ואז נעלמת –
 * ורק אז נפתח הטולטיפ של גלילת האגוז (NutScrollHandle מחכה ל-data-home-popup שייעלם).
 * מופיעה בכל כניסה לדף. אפשר גם לסגור ב-X / Esc / לחיצה על הרקע. העיצוב בקלאסים .hp-* ב-globals.css.
 */
export function HomePopup({ data, children }: { data: HomePopupData; children: React.ReactNode }) {
  const segs = useMemo(() => buildSegments(data), [data]);
  const total = useMemo(() => segs.reduce((n, s) => n + s.text.length, 0), [segs]);

  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  // ההודעה מופיעה רק אחרי שהכיתוב הזהב של דף הבית (פסקת הפתיחה) סיים להיכתב.
  // ואם מישהי התחילה לגלול ולא חיכתה לאנימציה – ההודעה מופיעה שנייה אחרי תחילת הגלילה
  useEffect(() => {
    const started = Date.now();
    let timer = 0;
    const arm = (ms: number) => {
      if (timer) return;
      timer = window.setTimeout(() => setShown(true), ms);
    };
    const stopListening = () => {
      clearInterval(poll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onNudge);
      window.removeEventListener("touchmove", onNudge);
      window.removeEventListener("keydown", onKey);
    };
    const onNudge = () => {
      stopListening();
      arm(AFTER_SCROLL_MS);
    };
    // גלילה שהדפדפן משחזר בטעינה (רענון) לא נחשבת – רק גלילה אחרי שהדף כבר נפתח
    const onScroll = () => {
      if (Date.now() - started > 1500 && window.scrollY > 12) onNudge();
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", "End", " "].includes(e.key)) onNudge();
    };
    const poll = setInterval(() => {
      const done = !!document.documentElement.dataset.homeLeadDone;
      if (!done && Date.now() - started < MAX_WAIT_MS) return;
      stopListening();
      arm(AFTER_ANIM_MS);
    }, 200);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onNudge, { passive: true });
    window.addEventListener("touchmove", onNudge, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      stopListening();
      clearTimeout(timer);
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

  // ההודעה מופיעה במלואה; אחרי זמן קריאה (לפי אורך הטקסט) היא נעלמת
  useEffect(() => {
    if (!shown || leaving) return;
    const t = setTimeout(dismiss, Math.min(READ_MAX_MS, READ_BASE_MS + total * READ_CHAR_MS));
    return () => clearTimeout(t);
  }, [shown, leaving, total, dismiss]);

  useEffect(() => {
    if (!shown || gone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, gone, dismiss]);

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
              {segs.map((s, i) => (
                <p key={i} className={s.cls}>
                  {s.nut && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/images/nut-handle.png" alt="" className="hp-nut" />
                  )}
                  {s.text}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
