"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { TourScript, TourStage, type Act, type TourDemoKind } from "./site-tour-demos";

/** מפעיל סיור מודרך באתר האמיתי: מדגיש אלמנט אמיתי בכל עמוד ומסביר לידו. נפתח מכפתור, או מהקישור /?tour=1 */

export const START_TOUR_EVENT = "start-site-tour";
const STORAGE_KEY = "bagrut-site-tour-step";

/** פרק לדוגמה בסיור — חייב להיות פרק שיש בו כרטיסי קבצים. אם הנתיב ישתנה, התחנה פשוט תוצג בלי הדגשה */
/** תיקיית הנושא שמכילה את הפרק, לצורך התחנות ״בתוך התיקיות״ */
const SAMPLE_TOPIC = "/subjects/torah/3-units/external/bo";
const SAMPLE_SUBJECT = "/subjects/torah";
const SAMPLE_CHAPTER = "/subjects/torah/3-units/external/bo/perek-10";

type Step = {
  path: string;
  /** סלקטורים לפי סדר עדיפות — הראשון שגלוי מודגש. בלי סלקטור: כרטיס במרכז המסך */
  target?: string[];
  title: string;
  body: string;
  /** שורה קטנה וחומה מתחת להסבר (למשל ״זו דוגמה״) */
  note?: string;
  cta?: { label: string; href: string };
  /** במפת הבגרות: פותח את כל הריבועים (כאילו נלחץ ״פתיחת כל מפת הבגרויות״) ומרכז את האלמנט המודגש גם לרוחב */
  mapOpen?: boolean;
  /** הדגמה מונפשת בתוך הכרטיס (קובץ יורד, תיקון בקובץ, שיחה בפורום) */
  demo?: TourDemoKind;
  /** לוחץ בשבילה (פעם אחת) על כפתור פתיחה שהטקסט שלו מכיל את המחרוזת, כדי להראות מה קורה אחרי הלחיצה */
  clickText?: string;
  /** תרחיש: הסיור מפעיל בעצמו את הרכיבים האמיתיים בעמוד (סמן שנע, לוחץ, מקליד) ומחליף את ההסבר בכל שלב */
  script?: Act[];
};

const FIX_SEL = ".fix-dialog[open]";
const FIX_SCRIPT: Act[] = [
  { say: "את לוחצת על ״לעריכת שינויים בקובץ״ שבכרטיסייה." },
  { click: ".mtc-lower button.mtc-row" },
  { spot: `${FIX_SEL} .fix-dialog-box` },
  { say: "קודם מופיעה הודעה חשובה. את קוראת אותה ולוחצת ״הבנתי, להמשיך״." },
  { wait: 2600 },
  { click: `${FIX_SEL} .fix-gate-btn` },
  { wait: 900 },
  { say: "הקובץ נפתח בחלון. את מסמנת בו את הטעות, בדיוק כמו בעכבר." },
  { select: `${FIX_SEL} .pdfv` },
  { wait: 800 },
  { say: "ולוחצת ״סימון לתיקון״." },
  { click: `${FIX_SEL} .pdfv-markbtn`, optional: true },
  { ensure: [`${FIX_SEL} .fix-edit-quote`, "הטקסט שסימנת בקובץ"] },
  { wait: 500 },
  { say: "מתחת את כותבת את התיקון שלך." },
  { type: [`${FIX_SEL} .fix-edit-fix`, "כאן כותבים איך זה צריך להיות"] },
  { wait: 500 },
  { say: "ולוחצת ״החל תיקון״: מה שצריך תיקון בורוד, והתיקון שלך בכחול." },
  { click: `${FIX_SEL} .fix-apply` },
  { wait: 2000 },
  { say: "ובסוף את שולחת את התיקון." },
  { click: `${FIX_SEL} .fix-actions .btn` },
  { wait: 1500 },
  { say: "התיקון חל אצלך מיד, ואנחנו בודקות אותו. אם הוא נכון, אנחנו מעדכנות את הקובץ לכל המורות." },
  { wait: 3200 },
  { click: `${FIX_SEL} .fix-done .btn:not(.btn-gold)` },
  { wait: 900 },
  { spot: ".mtc-lower" },
  {
    say: "בכרטיסייה נוספו שתי אפשרויות. ״לצפייה בשינויים שכבר נעשו״: את רואה את הטעות והתיקון בצבע, ובוחרת אילו תיקונים להשאיר. ״להורדת הקובץ המתוקן״: מורידה את הדף כשהתיקונים כבר בתוכו.",
  },
];

const FORUM_SCRIPT: Act[] = [
  { say: "בפורום את בוחרת מה לכתוב: שאלה, הערה או טיפ. עכשיו לוחצת על ״שאלה״." },
  { click: ".forum-kind-btn.fk-question" },
  { say: "כותבת את השאלה שלך." },
  { type: ["form.fk-question textarea", "איך כדאי להסביר את הפרק לכיתה חלשה?"] },
  { wait: 600 },
  { say: "ולוחצת ״פרסמי שאלה״." },
  { click: "form.fk-question button[type=submit]" },
  { spot: "#t-100" },
  { say: "השאלה שלך מופיעה בראש הפורום, כתובה ״את״. לאחרות היא מופיעה לפי מספר אישי ולא לפי שם." },
  { wait: 2600 },
  { say: "עכשיו ממתינים לתשובה…" },
  { spot: "#t-100 .forum-box-reply" },
  { say: "מורה שכבר לימדה את היחידה ענתה לך, ותשובתה מופיעה מתחת לשאלה. כך זה נראה בפורום האמיתי. בהדגמה הזו לא נשלח כלום." },
  { wait: 3200 },
];

const NAV_FALLBACK = 'header button[aria-label="תפריט"]';
/** מדגיש בסרגל העליון רק את הפריט שמוסבר, ובנייד (שם הסרגל מקופל) את כפתור ☰ */
const navItem = (href: string) => [`header nav[aria-label="ניווט ראשי"] a[href="${href}"]`, NAV_FALLBACK];

const STEPS: Step[] = [
  {
    path: "/",
    title: "ברוכה הבאה ללו״ז העניין",
    body: "זה סיור קצר באתר עצמו. אני מראה לך איפה הכול נמצא, ואת לוחצת ״המשך״. זה לוקח בערך שתי דקות, ואפשר לצאת בכל רגע.",
  },
  {
    path: "/subjects",
    target: navItem("/subjects"),
    title: "המקצועות",
    body: "כשאת לוחצת על ״המקצועות״ בסרגל, את נכנסת לבתים של כל המקצועות.",
  },
  {
    path: "/subjects",
    target: ['a[href^="/subjects/"][aria-label^="פתיחת"]'],
    title: "כל מקצוע הוא בית",
    body: "כשאת לוחצת על בית, את נכנסת פנימה, יחידה אחרי יחידה, עד לפרק המדויק שאת מלמדת.",
  },
  {
    path: SAMPLE_SUBJECT,
    target: ["header .gate-panel", "main h1"],
    title: "הסבר בראש התיקייה",
    body: "בראש כל תיקייה מחכה הסבר קצר על החומר שבתוכה, ולידו כמה יחידות וחומרים יש בה. ככה את יודעת איפה את נמצאת לפני שאת ממשיכה.",
  },
  {
    path: SAMPLE_TOPIC,
    target: ['a[href^="/subjects/"][aria-label^="פתיחת"]'],
    title: "יורדת עד הפרק",
    body: "בכל כרטיס כתוב כמה חומרים יש בו, ותיקייה חינמית מסומנת ב״חינם״.",
  },
  {
    path: SAMPLE_CHAPTER,
    target: [".chapter-login .fa-wrap", ".fa-wrap", ".coupon-stub"],
    title: "מורידה את כל התיקייה בבת אחת",
    demo: "zip",
    body: "בראש כל תיקייה יש כפתור ״הורידי את כל החומרים״. כשאת עומדת עליו, נפתחות שתי אפשרויות: להוריד את כל הקבצים כקובץ זיפ אחד, או לשלוח אותם למייל.",
  },
  {
    path: SAMPLE_CHAPTER,
    target: ["article.mtc .mtc-download", "article.mtc .mtc-body"],
    title: "שיעור אחד חינם: איך מקבלים אותו",
    body: "נרשמת, מאמתת מייל, בוחרת חומר ולוחצת על ״להורדה חינם״. ההורדה הראשונה שלך בחינם. שימי לב: גם צפייה בקובץ נחשבת הורדה.",
  },
  {
    path: "/tour-demo/fix",
    target: [".mtc-lower"],
    title: "מצאת טעות? תקני בעצמך",
    script: FIX_SCRIPT,
    body: "את מסמנת את הטקסט בקובץ וכותבת את התיקון. הוא מופיע אצלך מיד, ואנחנו בודקות: אם הוא נכון, אנחנו מעדכנות את הקובץ לכל המורות.",
  },
  {
    path: "/tour-demo/forum",
    target: [".forum-composer", ".forum-panel"],
    title: "פורום לכל יחידה",
    script: FORUM_SCRIPT,
    body: "בתחתית כל יחידה יש פורום שמוקדש רק לה. את שואלת או משתפת טיפ, ומורות שכבר לימדו את היחידה עונות לך. את מופיעה לפי מספר אישי ולא לפי שם. כותבות בפורום מנויות ומי שרכשה קובץ ביחידה.",
  },
  {
    path: "/map",
    target: navItem("/map"),
    title: "מפת הבגרות",
    body: "דרך ״מפת הבגרות״ בסרגל את מגיעה לתרשים של כל הבגרויות.",
  },
  {
    path: "/map",
    target: ["[data-map-scroll-x] > div:first-child", "[data-map-scroll-x]", "main h1"],
    title: "כל בגרות במבט אחד",
    body: "את רואה בבת אחת מה צריך ללמד בכל בגרות, לפי סמל השאלון. כל בגרות היא תרשים של ריבועים, ומהריבוע את מגיעה ישר לחומרים.",
  },
  {
    path: "/map",
    target: ["[data-map-scroll-x] .flow-node--open", "[data-map-scroll-x] .flow-node"],
    title: "לוחצת על ריבוע ונפתח הבא",
    body: "כשאת לוחצת על ריבוע, נפתח הריבוע הבא אחריו, וכך את יורדת צעד אחר צעד עד לפרק המדויק. לחיצה נוספת על אותו ריבוע סוגרת אותו.",
  },
  {
    path: "/map",
    mapOpen: true,
    target: [".flow-node button[aria-label^='קטעי מפרשים']"],
    title: "סימון הנוצה: קטעי מפרשים",
    body: "פרק שמסומן בנוצה כולל קטעי מפרשים. כשאת לוחצת על הנוצה, נפתחת בועה שמפרטת אילו מפרשים נלמדים בפרק הזה.",
  },
  {
    path: "/map",
    mapOpen: true,
    target: [".flow-node .flow-ready-mark"],
    title: "הוי: החומר כבר מוכן",
    body: "ריבוע שמסומן בוי ורוד בפינה כבר הוכן לו חומר, ואפשר להיכנס אליו ישר.",
  },
  {
    path: "/map",
    mapOpen: true,
    target: [".flow-node:has(.flow-ready-mark) .flow-arrow-circle", ".flow-node .flow-arrow-circle"],
    title: "החץ הקטן: נכנסת לתיקייה",
    body: "בצד כל ריבוע יש חץ קטן. כשאת לוחצת עליו, את עוברת לדף התיקייה עצמה, שם מחכים הקבצים. בריבוע סופי, כזה שאין אחריו ריבועים נוספים, החץ מביא אותך ישר לחומרים.",
  },
  {
    path: "/tour-demo/calendar",
    target: navItem("/account/downloads/calendar"),
    title: "ההורדות שלי",
    body: "ב״ההורדות שלי״ בסרגל, באזור האישי שלך, מחכה לך לוח שנה של כל מה שהורדת.",
  },
  {
    path: "/tour-demo/calendar",
    target: ['section[aria-label^="לוח שנה"]'],
    title: "לוח ההורדות שלך",
    body: "את רואה לוח שנה עברי. בכל יום מופיעות התיקיות שהורדת מהן ומספר ההורדות. את עוברת בין חודשים בכפתורים שמעל הלוח.",
    note: "מה שמופיע כאן הוא דוגמה.",
  },
  {
    path: "/tour-demo/calendar",
    target: ["#day-list"],
    title: "לוחצת על יום ונפתח הפירוט",
    body: "בלוח האמיתי, כשאת לוחצת על יום שיש בו הורדות, נפתח למטה חלון עם הפירוט: מה הורדת, באיזו שעה, אם הורדת את כל התיקייה או חלק ממנה, ואפשר גם להוריד שוב.",
  },
  {
    path: "/pricing",
    target: navItem("/pricing"),
    title: "המסלולים",
    body: "ב״מסלולים״ בסרגל את בוחרת איך לרכוש.",
  },
  {
    path: "/pricing",
    target: [".gate-card", "main h1"],
    title: "בוחרת מסלול",
    body: "הורדה בודדת כשצריך דחוף, מנוי שנתי להכנה מלאה, וגם מסלולים לממלאות מקום. המחירים כתובים בעמוד.",
  },
  {
    path: "/",
    target: ['[data-tour="hero-clock"]'],
    title: "השעון שבלוגו חי",
    body: "המחוגים בלוגו מראים את השעה האמיתית אצלך ונעים בזמן אמת, כולל מחוג השניות הזהוב.",
  },
  {
    path: "/",
    target: ['[class*="faqItemOpen"]'],
    clickText: "איך אני אדע אם החומר מתאים לי?",
    title: "יש שאלה? יש תשובה",
    body: "בעמוד הבית יש חלק של שאלות ותשובות. כשאת לוחצת על שאלה, התשובה נפתחת מתחתיה.",
  },
  {
    path: "/",
    target: ['[class*="faqAsk"]'],
    title: "לא מצאת תשובה? שאלי אותנו",
    body: "מתחת לשאלות יש תיבה. את כותבת את השאלה ולוחצת ״שליחה״, והיא מגיעה אלינו.",
  },
  {
    path: "/",
    target: [".dizzy-btn"],
    title: "״אני מסוחררת״: עוצרת את התנועה",
    body: "בראש האתר יש כפתור ״אני מסוחררת״. כשאת לוחצת עליו, כל האנימציות באתר נעצרות מיד והכול מוצג בלי תנועה. לחיצה נוספת מחזירה אותן. המצב לא נשמר, ולכן בכניסה חדשה לאתר לוחצים שוב.",
  },
  {
    path: "/",
    target: [".a11yw-fab"],
    title: "כפתור הנגישות",
    body: "הכפתור העגול בפינה נשאר בכל עמוד באתר. כשאת לוחצת עליו נפתח תפריט: הגדלת טקסט, ניגודיות גבוהה, הדגשת קישורים, עצירת אנימציות ופונט קריא במקום כתב היד. כל אפשרות נדלקת ונכבית בלחיצה, ההגדרות נשמרות אצלך, ו״איפוס הכול״ מחזיר את האתר למצבו הרגיל.",
  },
  {
    path: "/",
    title: "מה מחכה לך אחרי ההרשמה",
    body: "ההרשמה חינמית, ומחכים לך בפנים הקבצים החינמיים, מפת הבגרויות, הורדה אחת חינם על חומר לבחירתך, ומספר אישי שמופיע בקבצים שאת מורידה.",
    cta: { label: "להרשמה באתר", href: "/register" },
  },
];

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const GAP = 14;
const EDGE = 12;
const HEADER_H = 96;
/** גובה האזור בתחתית המסך שמור לכפתור ״המשך״ הקבוע */
const NEXT_AREA = 88;
/** בהדגמה רצה במסך רחב מספיק: כרטיס ההסבר צר ועומד בצד שמאל, והעמוד זז ימינה */
const SIDE_W = 320;
const SIDE_MIN_VIEW = 900;

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

export function TourLaunchButton({
  className,
  children,
  onLaunch,
}: {
  className?: string;
  children: React.ReactNode;
  /** נקרא ממש לפני תחילת הסיור (למשל לסגירת הודעה שמכסה את המסך) */
  onLaunch?: () => void;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onLaunch?.();
        window.dispatchEvent(new Event(START_TOUR_EVENT));
      }}
    >
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
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<string | null>(null);
  const [waited, setWaited] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  /** ההדגמה הארוכה (תרחיש) של התחנה הנוכחית הסתיימה – ״המשך״ מהבהב */
  const [demoDone, setDemoDone] = useState(false);

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

  // מסמן לשאר האתר שהסיור פעיל (למשל: הודעת הפתיחה של דף הבית לא קופצת מעל מה שמוסבר)
  const touring = step !== null;
  useEffect(() => {
    if (!touring) return;
    const root = document.documentElement;
    root.dataset.siteTour = "1";
    return () => {
      delete root.dataset.siteTour;
    };
  }, [touring]);

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

  // תחנת השאלות: פותחים בשבילה שאלה אחת כדי שתראה שאחרי הלחיצה מופיעה תשובה
  useEffect(() => {
    if (step === null || pathname !== STEPS[step].path) return;
    const text = STEPS[step].clickText;
    if (!text) return;
    let tries = 0;
    let clicks = 0;
    const timer = window.setInterval(() => {
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")).find((b) =>
        b.textContent?.includes(text),
      );
      if (btn) {
        // לוחצים עד שהמצב באמת התהפך (לחיצה לפני שהעמוד סיים להיטען לא עושה כלום)
        if (btn.getAttribute("aria-expanded") === "true" || clicks >= 40) window.clearInterval(timer);
        else if (++tries % 5 === 0) {
          clicks += 1;
          btn.click();
        }
      } else if (++tries >= 200) {
        window.clearInterval(timer);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [step, pathname]);

  // בתחנות הנוצה/הוי במפה: לוחצים בשבילה על ״פתיחת כל מפת הבגרויות״ (פעם אחת), כדי שהסימנים יהיו גלויים
  useEffect(() => {
    if (step === null || pathname !== STEPS[step].path || !STEPS[step].mapOpen) return;
    let tries = 0;
    let clicks = 0;
    const timer = window.setInterval(() => {
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")).find((b) =>
        b.textContent?.includes("פתיחת כל"),
      );
      if (btn) {
        // לוחצים עד שהמפה באמת נפתחה (לחיצה לפני שהעמוד סיים להיטען לא עושה כלום)
        if (btn.getAttribute("aria-pressed") === "true" || clicks >= 40) window.clearInterval(timer);
        else if (++tries % 5 === 0) {
          clicks += 1;
          btn.click();
        }
      } else if (++tries >= 200) {
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
          // בהדגמה רצה הכרטיס בראש המסך: מציבים את האלמנט ישר מתחתיו
          if (STEPS[step].script && window.innerWidth < SIDE_MIN_VIEW) {
            const below = (cardRef.current?.offsetHeight ?? 260) + EDGE * 2;
            window.scrollTo({ top: Math.max(0, window.scrollY + r.top - below), behavior: "smooth" });
            return;
          }
          const mobile = window.innerWidth < 640;
          let desired = mobile || r.height > window.innerHeight * 0.5 ? HEADER_H : (window.innerHeight - r.height) / 2;
          // אם במרכז המסך כרטיס ההסבר לא ייכנס מתחת לאלמנט – מצמידים את האלמנט לראש המסך (כשכך הכרטיס כן נכנס), כדי שלא יכסה אותו
          const ch = cardRef.current?.offsetHeight ?? 380;
          const room = window.innerHeight - EDGE - PAD - GAP - ch;
          if (!mobile && desired + r.height > room && HEADER_H + r.height <= room) desired = HEADER_H;
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
  }, [step, targetEl, waited]);

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

  // הכרטיס מופיע רק כשהעמוד של התחנה כבר נטען והאלמנט המודגש נמצא, כדי שההסבר והמוצג יהיו באותו קצב.
  // אם האלמנט לא נמצא תוך זמן סביר – מציגים את הכרטיס בכל זאת (במרכז).
  const onStepPage = step !== null && pathname === STEPS[step].path;
  const ready = onStepPage && (!STEPS[step].target || !!targetEl || waited);

  useEffect(() => {
    setCaption(null);
    setDemoDone(false);
  }, [step]);

  // גובה הכרטיס (הגבוה ביותר שהיה בתחנה, כדי שהחלון לא יקפוץ כשההסבר מתחלף) מועבר ל-CSS ולתרחיש
  const maxCardH = useRef({ step: -1, h: 0 });
  useEffect(() => {
    if (step === null || !STEPS[step].script) return;
    if (maxCardH.current.step !== step) maxCardH.current = { step, h: 0 };
    maxCardH.current.h = Math.max(maxCardH.current.h, cardH);
    const root = document.documentElement;
    root.style.setProperty("--tour-bot", `${NEXT_AREA + EDGE}px`);
    if (view.w >= SIDE_MIN_VIEW) root.style.setProperty("--tour-side", `${SIDE_W + EDGE * 2}px`);
    else root.style.setProperty("--tour-top", `${maxCardH.current.h + EDGE * 2}px`);
    return () => {
      for (const v of ["--tour-top", "--tour-side", "--tour-bot"]) root.style.removeProperty(v);
    };
  }, [step, cardH, view.w]);

  useEffect(() => {
    setWaited(false);
    if (!onStepPage) return;
    const t = window.setTimeout(() => setWaited(true), 6000);
    return () => window.clearTimeout(t);
  }, [step, onStepPage]);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const sideMode = !!s.script && view.w >= SIDE_MIN_VIEW;
  const cardW = Math.min(380, view.w - 24);
  const mobile = view.w < 640;
  // בתחתית המסך, תמיד באותו מקום, עומד כפתור ״המשך״: הכרטיס לא נכנס לאזור שלו
  const availH = view.h - NEXT_AREA;
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { top: availH / 2, left: "50%", transform: "translate(-50%, -50%)", width: cardW };
  } else {
    // מקום לכרטיס שלא מכסה את האלמנט המודגש: מתחתיו, מעליו, לצידו, ואם אין – בתחתית או בראש המסך
    const tl = rect.left - PAD;
    const tr = rect.left + rect.width + PAD;
    const tt = rect.top - PAD;
    const tb = rect.top + rect.height + PAD;
    const hits = (x: number, y: number) => x < tr && x + cardW > tl && y < tb && y + cardH > tt;
    const cx = clamp(rect.left + rect.width / 2 - cardW / 2, EDGE, view.w - cardW - EDGE);
    const cy = clamp(rect.top + rect.height / 2 - cardH / 2, EDGE, availH - cardH - EDGE);
    const options: { top: number; left: number }[] = [
      { top: tb + GAP, left: cx },
      { top: tt - GAP - cardH, left: cx },
      { top: cy, left: tr + GAP },
      { top: cy, left: tl - GAP - cardW },
    ];
    const fit = options.find(
      (o) => o.top >= EDGE && o.top + cardH <= availH - EDGE && o.left >= EDGE && o.left + cardW <= view.w - EDGE && !hits(o.left, o.top),
    );
    const centerLeft = (view.w - cardW) / 2;
    if (!mobile && fit) cardStyle = { top: fit.top, left: fit.left, width: cardW };
    else if (!hits(centerLeft, availH - 16 - cardH)) cardStyle = { bottom: NEXT_AREA + 16, left: "50%", transform: "translateX(-50%)", width: cardW };
    else if (!hits(centerLeft, 12)) cardStyle = { top: 12, left: "50%", transform: "translateX(-50%)", width: cardW };
    else cardStyle = { bottom: NEXT_AREA + 16, left: "50%", transform: "translateX(-50%)", width: cardW };
  }
  // בהדגמה רצה הכרטיס לא מסתיר את מה שהסמן עושה: במסך רחב הוא עומד בצד שמאל והעמוד/החלון זזים ימינה (--tour-side);
  // במסך צר הוא קבוע בראש המסך והם זזים אל מתחתיו (--tour-top)
  if (s.script) {
    cardStyle = sideMode
      ? { top: 72, left: EDGE, width: SIDE_W }
      : { top: EDGE, left: "50%", transform: "translateX(-50%)", width: cardW };
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

      {!ready && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sun bg-[#16244e] px-5 py-2 text-lg text-sun shadow-2xl" style={{ fontFamily: "var(--font-hand)" }}>
          רק רגע…
        </div>
      )}
      {ready && (s.demo === "download" || s.demo === "zip") && <TourStage key={step} kind={s.demo} />}
      {ready && s.script && <TourScript key={step} acts={s.script} onSay={setCaption} onSpot={setTargetEl} onDone={() => setDemoDone(true)} />}

      {ready && (
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
          {s.title}
        </h2>
        {/* ההסבר בריבוע זהב בהיר באותו סגנון של חלונית "שימי לב!": מסגרת שחורה, אותיות שחורות, כתב יד */}
        <p
          className="mx-1 mt-4 mb-1 rounded-xl border-[2.5px] border-[#0a0a0a] bg-[#fbefc2] px-4 py-3 text-xl leading-relaxed text-black"
          style={{ fontFamily: "var(--font-hand)", outline: "2px dashed var(--sun)", outlineOffset: 5 }}
        >
          {caption ?? s.body}
          {!caption && s.note && <span className="mt-2 block text-sm leading-snug" style={{ color: "#7a4a1e" }}>{s.note}</span>}
        </p>

        {s.script && (
          <div
            role="status"
            className="tour-tip mx-1 mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm leading-snug text-white"
            data-done={demoDone ? "1" : undefined}
          >
            {demoDone
              ? "ההדגמה הסתיימה. עכשיו אפשר ללחוץ על ״המשך״ שמהבהב למטה."
              : "ההדגמה רצה בעצמה. כשהיא תסתיים, כפתור ״המשך״ שבתחתית המסך יהבהב."}
          </div>
        )}
      </div>
      )}

      {/* ״המשך״ קבוע בתחתית המסך, באותו מקום בכל תחנה, כדי שיהיה נוח ללחוץ */}
      {ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3" style={{ paddingBottom: 14 }}>
          <style>{`
            @keyframes tour-next-blink{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,214,64,.0)}50%{transform:scale(1.1);box-shadow:0 0 0 14px rgba(255,214,64,.45)}}
            @keyframes tour-tip-pop{from{opacity:0;transform:translateY(8px) scale(.92)}to{opacity:1;transform:none}}
            .tour-tip{animation:tour-tip-pop .35s ease-out}
            .tour-tip[data-done]{background:rgba(255,214,64,.22)}
            .tour-next[data-blink]{animation:tour-next-blink .9s ease-in-out infinite}
            @media (prefers-reduced-motion:reduce){.tour-next[data-blink]{animation:none;outline:4px solid #fff}}
          `}</style>
          {last && s.cta ? (
            <Link href={s.cta.href} onClick={close} className="btn btn-gold pointer-events-auto px-10 py-3 text-2xl">
              {s.cta.label}
            </Link>
          ) : (
            <button
              ref={nextRef}
              type="button"
              onClick={() => (last ? close() : goTo(step + 1))}
              data-blink={demoDone ? "1" : undefined}
              className="tour-next btn btn-gold pointer-events-auto min-w-[200px] px-12 py-3 text-3xl"
              style={{ fontFamily: "var(--font-hand)" }}
            >
              {last ? "סיום" : "המשך"} {!last && <span aria-hidden>←</span>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
