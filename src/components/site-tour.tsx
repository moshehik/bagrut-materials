"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

/** מפעיל סיור מודרך באתר האמיתי: מדגיש אלמנט אמיתי בכל עמוד ומסביר לידו. נפתח מכפתור, או מהקישור /?tour=1 */

export const START_TOUR_EVENT = "start-site-tour";
const STORAGE_KEY = "bagrut-site-tour-step";

/** פרק לדוגמה בסיור — חייב להיות פרק שיש בו כרטיסי קבצים. אם הנתיב ישתנה, התחנה פשוט תוצג בלי הדגשה */
const SAMPLE_CHAPTER = "/subjects/torah/3-units/external/bo/perek-10";

type Step = {
  path: string;
  /** סלקטורים לפי סדר עדיפות — הראשון שגלוי מודגש. בלי סלקטור: כרטיס במרכז המסך */
  target?: string[];
  title: string;
  body: string;
  cta?: { label: string; href: string };
  /** במפת הבגרות: פותח את כל הריבועים (כאילו נלחץ ״פתיחת כל מפת הבגרויות״) ומרכז את האלמנט המודגש גם לרוחב */
  mapOpen?: boolean;
  /** מעבר אוטומטי בין אלמנטים (בלי ללחוץ ״הבאה״): מדגיש כל אחד לפי הסדר עם משפט קצר לפי הערך של data-lesson, ובסוף עובר לתחנה הבאה */
  auto?: { selector: string; texts: Record<string, string>; ms: number };
};

const LESSON_TEXTS: Record<string, string> = {
  student: "דף עבודה לתלמידה, עם מקומות למילוי.",
  teacher: "אותו דף עם התשובות, למורה.",
  quiz: "בוחן קצר על הפרק, מוכן להדפסה.",
  "quiz-answers": "התשובות לבוחן.",
  exam: "שאלות מבגרויות קודמות על הפרק.",
  "exam-answers": "התשובות לשאלות מהבגרויות.",
  dictation: "סיכום קצר להכתבה בכיתה.",
  discussions: "דיונים ופעילויות לשיעור.",
  enrichment: "דף העשרה עם ידיעות מעניינות.",
  skills: "מיומנויות למידה לפרק.",
  prep: "דף הכנה ובקיאות לפני הבוחן.",
  presentation: "מצגת לליווי השיעור. בקרוב.",
};

const STEPS: Step[] = [
  {
    path: "/",
    title: "ברוכה הבאה ללו״ז העניין",
    body: "זה סיור קצר באתר עצמו: אני מראה לך איפה הכול נמצא, ואת לוחצת ״הבאה״. לוקח בערך שתי דקות, ואפשר לצאת בכל רגע.",
  },
  {
    path: "/",
    target: ['[data-tour="hero-clock"]'],
    title: "השעון שבלוגו חי",
    body: "המחוגים בלוגו מראים את השעה האמיתית אצלך ונעים בזמן אמת, כולל מחוג השניות הזהוב.",
  },
  {
    path: "/",
    auto: { selector: '[data-tour="lesson-spec"] [data-lesson]', texts: LESSON_TEXTS, ms: 1500 },
    title: "מה יש בשיעור",
    body: "לכל שיעור מחכה מעטפת מלאה. עוברים על הקבצים אחד אחד, והמפרט משתנה לפי סוג השיעור.",
  },
  {
    path: "/",
    target: ['header nav[aria-label="ניווט ראשי"]', 'header button[aria-label="תפריט"]'],
    title: "הסרגל שבראש האתר",
    body: "הוא נמצא בכל עמוד. משם מגיעות למקצועות, למפת הבגרות, למסלולים ולהורדות שלך. בנייד הוא מתקפל לכפתור ☰.",
  },
  {
    path: "/subjects",
    target: ['a[href^="/subjects/"][aria-label^="פתיחת"]'],
    title: "כל מקצוע הוא בית",
    body: "לוחצות על בית ונכנסות פנימה, יחידה אחרי יחידה, עד לפרק המדויק שאת מלמדת.",
  },
  {
    path: "/map",
    target: [".map-guide", "main h1"],
    title: "מפת הבגרות",
    body: "רואים בבת אחת מה צריך ללמד בכל בגרות, לפי סמל השאלון. כל בגרות היא תרשים של ריבועים, ומהריבוע אפשר להגיע ישר לחומרים.",
  },
  {
    path: "/map",
    target: ["[data-map-scroll-x] .flow-node--open", "[data-map-scroll-x] .flow-node"],
    title: "לוחצים על ריבוע ונפתח הבא",
    body: "לחיצה על ריבוע פותחת את הריבוע הבא אחריו, וכך יורדים צעד אחר צעד עד לפרק המדויק. לחיצה נוספת על אותו ריבוע סוגרת אותו.",
  },
  {
    path: "/map",
    mapOpen: true,
    target: [".flow-node button[aria-label^='קטעי מפרשים']"],
    title: "סימון הנוצה: קטעי מפרשים",
    body: "פרק שמסומן בנוצה כולל קטעי מפרשים. לחיצה על הנוצה פותחת בועה שמפרטת אילו מפרשים נלמדים בפרק הזה.",
  },
  {
    path: "/map",
    mapOpen: true,
    target: [".flow-node .flow-ready-mark"],
    title: "הוי: החומר כבר מוכן",
    body: "ריבוע שמסומן בוי ורוד בפינה כבר הוכן לו חומר, ואפשר ללחוץ על החץ הקטן שלידו ולהיכנס ישר לחומרים.",
  },
  {
    path: SAMPLE_CHAPTER,
    target: [".chapter-login .fa-wrap", ".fa-wrap", ".coupon-stub"],
    title: "מורידות את כל התיקייה בבת אחת",
    body: "בראש כל תיקייה יש כפתור ״הורידי את כל החומרים״. עומדות עליו, ונפתחות שתי אפשרויות: להוריד את כל הקבצים כקובץ זיפ אחד, או לשלוח אותם למייל.",
  },
  {
    path: SAMPLE_CHAPTER,
    target: ["article.mtc"],
    title: "כרטיס לכל קובץ",
    body: "בכל פרק מחכים שכפול לתלמידה, שכפול למורה, בוחן ועוד. כל קובץ בכרטיס משלו, מוכן ללימוד.",
  },
  {
    path: SAMPLE_CHAPTER,
    target: ["article.mtc .mtc-body"],
    title: "מורידות, צופות או שולחות למייל",
    body: "אפשר להוריד, לצפות באתר בלי להוריד, או לשלוח את הקובץ ישר לתיבת המייל. לפני ההורדה הראשונה נרשמות פעם אחת, בחינם.",
  },
  {
    path: SAMPLE_CHAPTER,
    target: ["article.mtc .mtc-lower"],
    title: "מצאת טעות? תקני בעצמך",
    body: "מסמנות את הטקסט, כותבות את התיקון, והוא מופיע אצלך מיד. אנחנו בודקות, ואם הוא נכון מעדכנות את הקובץ לכל המורות.",
  },
  {
    path: SAMPLE_CHAPTER,
    target: ["#unit-forum-h"],
    title: "פורום לכל יחידה",
    body: "בתחתית כל יחידה יש פורום שמוקדש רק לה. שואלות שאלה, כותבות הערה או משתפות טיפ, ומורות שכבר לימדו את היחידה עונות. המורות מופיעות לפי מספר אישי ולא לפי שם, ובפורום כותבות מנויות ומי שרכשה קובץ ביחידה.",
  },
  {
    path: "/tour-demo/calendar",
    target: ['section[aria-label^="לוח שנה"]'],
    title: "לוח ההורדות שלך",
    body: "באזור האישי, ב״ההורדות שלי״, יש לוח שנה עברי של כל מה שהורדת. בכל יום מופיעות התיקיות שהורדת מהן ומספר ההורדות, בשבתות מופיעה פרשת השבוע, ומסומנים חגים וצומות. עוברות בין חודשים בכפתורים שמעל הלוח. מה שמופיע כאן הוא דוגמה.",
  },
  {
    path: "/tour-demo/calendar",
    target: ["#day-list"],
    title: "לוחצות על יום ונפתח הפירוט",
    body: "בלוח האמיתי לחיצה על יום שיש בו הורדות פותחת למטה חלון עם הפירוט: מה הורדת, באיזו שעה, אם הורדת את כל התיקייה או חלק ממנה, ואפשר גם להוריד שוב.",
  },
  {
    path: "/pricing",
    target: [".gate-card", "main h1"],
    title: "המסלולים",
    body: "הורדה בודדת כשצריך דחוף, מנוי שנתי להכנה מלאה, וגם מסלולים לממלאות מקום. המחירים כתובים בעמוד.",
  },
  {
    path: "/pricing",
    title: "זה הכול. עכשיו תורך",
    body: "הצעד הראשון הוא הרשמה חינמית, ומשם את מטיילת באתר בעצמך.",
    cta: { label: "להרשמה באתר", href: "/register" },
  },
];

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const GAP = 14;
const EDGE = 12;
const HEADER_H = 96;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(Math.max(n, lo), Math.max(lo, hi));
}

function findTarget(selectors?: string[]): HTMLElement | null {
  if (!selectors) return null;
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function readStored(): number | null {
  try {
    const n = Number(sessionStorage.getItem(STORAGE_KEY));
    return Number.isInteger(n) && n >= 0 && n < STEPS.length && sessionStorage.getItem(STORAGE_KEY) !== null ? n : null;
  } catch {
    return null;
  }
}

function writeStored(n: number | null) {
  try {
    if (n === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function TourLaunchButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}>
      {children}
    </button>
  );
}

export function SiteTour() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [step, setStep] = useState<number | null>(null);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [view, setView] = useState({ w: 1024, h: 768 });
  const [cardH, setCardH] = useState(200);
  const [autoNow, setAutoNow] = useState<{ label: string; text: string } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<string | null>(null);

  const close = useCallback(() => {
    pending.current = null;
    writeStored(null);
    setStep(null);
  }, []);

  const goTo = useCallback(
    (n: number) => {
      const target = STEPS[n];
      if (!target) return close();
      writeStored(n);
      setTargetEl(null);
      setRect(null);
      if (window.location.pathname !== target.path) {
        pending.current = target.path;
        router.push(target.path);
      }
      setStep(n);
    },
    [close, router],
  );

  // התחלה: מכפתור, מהקישור ?tour=1, או המשך אחרי רענון
  useEffect(() => {
    const onStart = () => goTo(0);
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [goTo]);

  const startParam = search?.get("tour");
  useEffect(() => {
    if (startParam === "1") {
      goTo(0);
      router.replace(pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startParam]);

  useEffect(() => {
    const saved = readStored();
    if (saved !== null && STEPS[saved].path === window.location.pathname) setStep(saved);
    else writeStored(null);
  }, []);

  // עזבה את מסלול הסיור בעצמה (חזרה, קישור) – סוגרים
  useEffect(() => {
    if (step === null) return;
    if (pathname === STEPS[step].path) {
      pending.current = null;
      return;
    }
    if (pending.current === null) close();
  }, [pathname, step, close]);

  // תחנה אוטומטית (מפרט השיעור): מדגישה כל פריט לפי הסדר ועוברת הלאה בסופה, בלי ללחוץ ״הבאה״
  useEffect(() => {
    setAutoNow(null);
    if (step === null || pathname !== STEPS[step].path) return;
    const auto = STEPS[step].auto;
    if (!auto) return;
    let poll = 0;
    let next = 0;
    let tries = 0;
    const run = (els: HTMLElement[]) => {
      let i = 0;
      const show = () => {
        const el = els[i];
        const key = el.dataset.lesson ?? "";
        setAutoNow({ label: el.querySelector("b")?.textContent ?? "", text: auto.texts[key] ?? "" });
        setTargetEl(el);
        const r = el.getBoundingClientRect();
        window.scrollTo({
          top: Math.max(0, window.scrollY + r.top - (window.innerHeight - r.height) / 2),
          behavior: "smooth",
        });
        next = window.setTimeout(() => {
          i += 1;
          if (i < els.length) show();
          else goTo(step + 1);
        }, auto.ms);
      };
      show();
    };
    poll = window.setInterval(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(auto.selector));
      if (els.length) {
        window.clearInterval(poll);
        run(els);
      } else if (++tries >= 100) {
        window.clearInterval(poll);
      }
    }, 150);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(next);
    };
  }, [step, pathname, goTo]);

  // בתחנות הנוצה/הוי במפה: לוחצים בשבילה על ״פתיחת כל מפת הבגרויות״ (פעם אחת), כדי שהסימנים יהיו גלויים
  useEffect(() => {
    if (step === null || pathname !== STEPS[step].path || !STEPS[step].mapOpen) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")).find((b) =>
        b.textContent?.includes("פתיחת כל"),
      );
      if (btn) {
        window.clearInterval(timer);
        btn.click();
      } else if (++tries >= 40) {
        window.clearInterval(timer);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [step, pathname]);

  // מציאת האלמנט המודגש (אחרי טעינת העמוד) וגלילה אליו
  useEffect(() => {
    if (step === null || pathname !== STEPS[step].path) return;
    const selectors = STEPS[step].target;
    if (!selectors) return;
    let tries = 0;
    let late = 0;
    const timer = window.setInterval(() => {
      const el = findTarget(selectors);
      if (el) {
        window.clearInterval(timer);
        // מיישרים את האלמנט במסך; פעם שנייה אחרי שהעמוד נרגע (תמונות/גופנים משנים גובה)
        const align = () => {
          // בתרשים המפה האלמנט יכול להיות מחוץ למסך גם לרוחב (גלילה אופקית בתוך התרשים)
          if (STEPS[step].mapOpen) {
            el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            return;
          }
          const r = el.getBoundingClientRect();
          const mobile = window.innerWidth < 640;
          const desired = mobile || r.height > window.innerHeight * 0.5 ? HEADER_H : (window.innerHeight - r.height) / 2;
          window.scrollTo({ top: Math.max(0, window.scrollY + r.top - desired), behavior: "smooth" });
        };
        align();
        late = window.setTimeout(align, 700);
        setTargetEl(el);
      } else if (++tries >= 100) {
        window.clearInterval(timer);
      }
    }, 150);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(late);
    };
  }, [step, pathname]);

  // מעקב אחרי מיקום האלמנט (גלילה, שינוי גודל, אנימציות)
  useEffect(() => {
    if (!targetEl) {
      setRect(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      if (!targetEl.isConnected) {
        setTargetEl(null);
        return;
      }
      const r = targetEl.getBoundingClientRect();
      setRect((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [targetEl]);

  useEffect(() => {
    if (step === null) return;
    const update = () => setView({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [step]);

  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && h !== cardH) setCardH(h);
  });

  useEffect(() => {
    if (step === null) return;
    nextRef.current?.focus({ preventScroll: true });
  }, [step]);

  // מקלדת: RTL – חץ שמאלה = הבאה
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") goTo(step + 1 < STEPS.length ? step + 1 : step);
      else if (e.key === "ArrowRight" && step > 0) goTo(step - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, goTo, close]);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const cardW = Math.min(380, view.w - 24);
  const mobile = view.w < 640;
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: cardW };
  } else {
    const below = rect.top + rect.height + PAD + GAP;
    const above = rect.top - PAD - GAP - cardH;
    const left = clamp(rect.left + rect.width / 2 - cardW / 2, EDGE, view.w - cardW - EDGE);
    if (!mobile && below + cardH <= view.h - EDGE) cardStyle = { top: below, left, width: cardW };
    else if (!mobile && above >= EDGE) cardStyle = { top: above, left, width: cardW };
    else cardStyle = { bottom: 16, left: "50%", transform: "translateX(-50%)", width: cardW };
  }

  return (
    <div className="fixed inset-0 z-[9998]" aria-live="polite">
      {/* חוסם לחיצות על האתר בזמן הסיור; הניווט רק בכפתורי הסיור */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} style={rect ? undefined : { background: "rgba(22,36,78,.62)" }} />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-2xl motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(22,36,78,.62)",
            outline: "3px solid var(--sun)",
            outlineOffset: 0,
            transition: "top .25s, left .25s, width .25s, height .25s",
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="סיור באתר"
        className="absolute rounded-2xl border-2 border-sun bg-[#16244e] p-5 text-white shadow-2xl"
        style={cardStyle}
      >
        <button
          type="button"
          onClick={close}
          aria-label="יציאה מהסיור"
          className="absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="text-xs font-semibold text-white/60">
          תחנה {step + 1} מתוך {STEPS.length}
        </div>
        <h2 className="mt-1 text-2xl font-normal text-sun" style={{ fontFamily: "var(--font-hand)" }}>
          {autoNow?.label || s.title}
        </h2>
        <p className="mt-2 text-base leading-relaxed text-white/95">{autoNow?.text || s.body}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {last && s.cta ? (
            <Link href={s.cta.href} onClick={close} className="btn btn-gold text-sm py-2">
              {s.cta.label}
            </Link>
          ) : (
            <button
              ref={nextRef}
              type="button"
              onClick={() => (last ? close() : goTo(step + 1))}
              className="btn btn-gold text-sm py-2"
            >
              {last ? "סיום" : "הבאה"} {!last && <span aria-hidden>←</span>}
            </button>
          )}
          {step > 0 && (
            <button type="button" onClick={() => goTo(step - 1)} className="btn btn-line-white text-sm py-2">
              <span aria-hidden>→</span> הקודמת
            </button>
          )}
          {!last && (
            <button type="button" onClick={close} className="ms-auto text-sm text-white/70 hover:text-white">
              דלגי
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
