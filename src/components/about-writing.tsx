"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useCalm } from "@/lib/calm-mode";
import s from "@/app/home.module.css";

/** הטקסט של "מי אנחנו": פסקאות ← שורות ← קטעים (קטע מודגש = שם המותג). */
type Seg = { t: string; brand?: boolean };
type Line = Seg[];
type Para = { lines: Line[]; className?: string };

const T = (t: string): Seg => ({ t });
const B = (t: string): Seg => ({ t, brand: true });

const PARAS: Para[] = [
  { lines: [[T("מורות.")], [T("כמוך.")]] },
  {
    lines: [
      [T("והבנו שהגיע הזמן-")],
      [T("לייצר את הגלגל עבור כולן,")],
      [T("במקום לייצר אותו בכל פעם מחדש.")],
      [T("יש מאין.")],
    ],
  },
  {
    lines: [[T("הקמנו עבורך פלטפורמה מקצועית, יסודית ועשירה")], [T("עבור תכני הלמידה לבגרות החרדית.")]],
  },
  {
    lines: [
      [T("כן.")],
      [T("כל מה שאת צריכה כדי להכין את התלמידה מ-0 ל-100.")],
      [T("כולל חומרי העשרה חדשניים מגוונים ומרתקים")],
      [T("לכל שיעור!")],
      [T("את רק צריכה ללחוץ על הכפתור.")],
    ],
  },
  { lines: [[T("האתר בנוי ומעוצב בצורה מונגשת ונעימה,")], [T("כזאת שתרגישי בה בבית.")]] },
  {
    className: s.aboutClose,
    lines: [
      [T("אנחנו פה בשבילך,")],
      [T("להקל על העומס,")],
      [T("ולתת לך לתת יותר,")],
      [T("בדיוק כמו שאת אוהבת.")],
    ],
  },
];

const SIGN: Line[] = [[B("צוות לו״ז העניין")], [T("בהנהלת חיה שיינווטר")]];

// השורות לא נכתבות אות אחר אות אלא עולות בהדרגה, שורה שורה (דהייה רכה) – פחות "מהבהב" לעין.
const LINE_BASE_MS = 680; // ms קבועים לכל שורה (בין תחילת שורה לתחילת הבאה)
const LINE_CHAR_MS = 18; // ms נוספים לכל אות בשורה – שורה ארוכה "מחזיקה" קצת יותר
const PARA_PAUSE = 600; // ms נוספים בין פסקאות
const LEAD_MS = 350; // ms מתחילת הפתיחה עד השורה הראשונה

/** כל שורה מקבלת השהיה משלה (--d) לפי מקומה בטקסט; מחושב פעם אחת, באותו סדר לשרת ולדפדפן. */
function plan() {
  let d = LEAD_MS;
  const planLine = (line: Line) => {
    const out = {
      d,
      segs: line.map((seg) => ({ brand: seg.brand, words: seg.t.split(" ") })),
    };
    d += LINE_BASE_MS + LINE_CHAR_MS * line.reduce((n, seg) => n + [...seg.t].length, 0);
    return out;
  };
  const paras = PARAS.map((p) => {
    const lines = p.lines.map(planLine);
    d += PARA_PAUSE;
    return { className: p.className, lines };
  });
  const sign = SIGN.map(planLine);
  return { paras, sign, total: d };
}
const PLAN = plan();

function Words({ segs }: { segs: ReturnType<typeof plan>["sign"][number]["segs"] }) {
  return (
    <>
      {segs.map((seg, si) => {
        // הרווח בין מילים נשאר מחוץ ל-nowrap כדי שהשורה תוכל להישבר בו במסכים צרים
        const inner = seg.words.map((w, wi) => (
          <span key={wi}>
            <span className={s.wWord}>{w}</span>
            {wi < seg.words.length - 1 ? " " : ""}
          </span>
        ));
        return seg.brand ? (
          <b key={si} className={s.aboutBrand}>
            {inner}
          </b>
        ) : (
          <span key={si}>{inner}</span>
        );
      })}
    </>
  );
}

const OPEN_AHEAD = 250; // הדף נפתח מעט לפני שהשורה מתחילה להיכתב
const LOGO_MS = 1300; // זמן הצגת הלוגו אחרי החתימה

const FOLLOW_MARGIN = 130; // הקצה התחתון של האיגרת נשמר כך הרחק מתחתית המסך

type Phase = "static" | "armed" | "writing" | "done";

/** מי אנחנו: איגרת-גליל שנפתחת תוך כדי הופעת הטקסט שורה אחר שורה. בלי JS / עם "הפחתת תנועה" – הכול גלוי מיד. */
export function AboutWriting() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("static");
  const calm = useCalm();
  const played = useRef(false); // כבר התחילה/הסתיימה פעם אחת – לא מנגנים שוב כשחוזרים ממצב "אני מסוחררת"

  useEffect(() => {
    const wrap = wrapRef.current;
    const body = bodyRef.current;
    if (!wrap || !body) return;
    if (calm) {
      // "אני מסוחררת": הדף נפתח ומופיע במלואו מיד (הניקוי של הריצה הקודמת עוצר את הכתיבה והגלילה)
      setPhase("static");
      return;
    }
    if (played.current) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      wrap.closest(".a11y-no-motion") ||
      !("IntersectionObserver" in window) ||
      typeof body.animate !== "function"
    )
      return;

    // מדידה במצב הסטטי (הכול גלוי): איפה מסתיימת כל שורה, ומתי היא מתחילה להיכתב
    const top = body.getBoundingClientRect().top;
    const marks = [...body.querySelectorAll<HTMLElement>("[data-t]")].map((el) => ({
      t: Number(el.dataset.t),
      h: el.getBoundingClientRect().bottom - top,
    }));
    const fullBody = body.scrollHeight;
    const wrapH = wrap.offsetHeight;
    const dur = PLAN.total + LOGO_MS;
    wrap.style.minHeight = wrapH + "px"; // שומר מקום – שום דבר מתחת לא קופץ בזמן הפתיחה

    const frames: Keyframe[] = [{ height: "0px", offset: 0 }];
    let prev = 0;
    for (const m of marks) {
      const off = Math.min(1, Math.max(prev, (m.t - OPEN_AHEAD) / dur));
      frames.push({ height: m.h + "px", offset: off });
      prev = off;
    }
    frames.push({ height: fullBody + "px", offset: 1 });

    setPhase("armed"); // מעכשיו האותיות מוסתרות והדף סגור
    let anim: Animation | undefined;
    let raf = 0;
    let following = false;
    let lastY = 0;
    let last = 0;
    const onWheel = (ev: WheelEvent) => ev.deltaY < 0 && stopFollow();
    const onKey = (ev: KeyboardEvent) => ["ArrowUp", "PageUp", "Home"].includes(ev.key) && stopFollow();
    function stopFollow() {
      if (!following) return;
      following = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    }
    // הדף נפתח כלפי מטה – גוללים אחריו מעצמו כדי שהקוראת לא תצטרך לגלול.
    // עוצרים רק כשהיא גוללת למעלה (גלגלת/מקש/גרירה) – לא על גלילה כלפי מטה.
    const follow = (now: number) => {
      if (!following) return;
      if (window.scrollY < lastY - 3) return stopFollow();
      const k = 1 - Math.exp(-Math.min(now - last, 250) / 170); // החלקה שלא תלויה בקצב הפריימים
      last = now;
      const bottom = body.getBoundingClientRect().bottom + 30; // + הגליל התחתון
      const delta = bottom - (window.innerHeight - FOLLOW_MARGIN);
      if (delta > 1) window.scrollTo({ top: window.scrollY + Math.max(1, delta * k), behavior: "instant" });
      lastY = window.scrollY;
      raf = requestAnimationFrame(follow);
    };
    const startFollow = () => {
      following = true;
      last = performance.now();
      lastY = window.scrollY;
      window.addEventListener("wheel", onWheel, { passive: true });
      window.addEventListener("keydown", onKey);
      raf = requestAnimationFrame(follow);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        played.current = true;
        setPhase("writing");
        anim = body.animate(frames, { duration: dur, easing: "linear", fill: "forwards" });
        startFollow();
        anim.onfinish = () => {
          stopFollow();
          wrap.style.minHeight = "";
          setPhase("done"); // חוזר לגובה אוטומטי – מגיב לשינוי רוחב מסך
          anim?.cancel();
        };
      },
      { threshold: 0.2 },
    );
    io.observe(wrap);
    return () => {
      stopFollow();
      io.disconnect();
      anim?.cancel();
      wrap.style.minHeight = "";
    };
  }, [calm]);

  const sc = PLAN.sign[0].d;
  return (
    <div
      ref={wrapRef}
      className={`${s.scroll} ${phase === "armed" ? s.wArmed : ""} ${phase === "writing" ? s.wOn : ""}`}
      style={{ "--logo-d": `${PLAN.total}ms` } as CSSProperties}
    >
      <div className={s.scrollRoll} aria-hidden="true" />
      <div ref={bodyRef} className={s.scrollBody}>
        <div className={s.scrollSheet}>
          <div className={s.writing}>
            {PARAS.map((p, i) => (
              <p key={i} className={PLAN.paras[i].className}>
                {PLAN.paras[i].lines.map((line, li) => (
                  <span key={li} className={s.wLine} data-t={line.d} style={{ "--d": `${line.d}ms` } as CSSProperties}>
                    <Words segs={line.segs} />
                  </span>
                ))}
              </p>
            ))}
            <p>
              <span className={s.aboutHeart} aria-hidden="true" data-t={sc}>
                ♥
              </span>
              {PLAN.sign.map((line, li) => (
                <span key={li} className={s.wLine} data-t={line.d} style={{ "--d": `${line.d}ms` } as CSSProperties}>
                  <Words segs={line.segs} />
                </span>
              ))}
            </p>
          </div>
          <img
            src="/images/logo.png"
            alt="לו״ז העניין — בית לחומרי הבגרות"
            className={s.aboutLogo}
            data-t={PLAN.total}
          />
        </div>
      </div>
      <div className={s.scrollRoll} aria-hidden="true" />
    </div>
  );
}
