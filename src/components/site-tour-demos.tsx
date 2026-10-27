"use client";

import { useEffect, useState } from "react";
import { Check, FileText, FileArchive } from "lucide-react";

/** הדגמות על העמוד עצמו בסיור. הכול דוגמה: שום דבר לא נשלח ולא נשמר. */

export type TourDemoKind = "zip" | "download";

/** מחזור שלבים: מחזיר את מספר השלב הנוכחי; אחרי השלב האחרון חוזר להתחלה */
function usePhase(durations: number[]) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setPhase((p) => (p + 1) % durations.length), durations[phase]);
    return () => window.clearTimeout(t);
  }, [phase, durations]);
  return phase;
}

/** הדגמה על העמוד עצמו: סמן עכבר נע אל הכפתור האמיתי בכרטיס, לוחץ, ורואים את הדף נפתח / הקובץ יורד. הכול דוגמה: שום דבר לא נפתח ולא יורד באמת. */
type Pt = { x: number; y: number };

const STAGE = {
  download: {
    open: 'article.mtc a[aria-label^="צפייה ב"], article.mtc button[aria-label^="צפייה ב"]',
    get: 'article.mtc a[aria-label^="הורדת"]',
    file: "דף לתלמידה.pdf",
    sheet: true,
  },
  zip: {
    open: "",
    get: ".chapter-login .fa-wrap, .fa-wrap",
    file: "כל החומרים של הפרק.zip",
    sheet: false,
  },
} as const;

// שלבים: 0 סמן מגיע • 1 לחיצה (פתיחה) • 2 הדף פתוח • 3 סמן עובר להורדה • 4 לחיצה • 5 הקובץ ירד
const STAGE_PHASES = [900, 450, 2100, 900, 450, 2400];

export function TourStage({ kind }: { kind: "download" | "zip" }) {
  const cfg = STAGE[kind];
  const phase = usePhase(STAGE_PHASES);
  const [pos, setPos] = useState<{ open: Pt | null; get: Pt | null }>({ open: null, get: null });

  // מיקום הכפתורים האמיתיים (מתעדכן גם בגלילה)
  useEffect(() => {
    const center = (sel: string): Pt | null => {
      if (!sel) return null;
      const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const read = () => setPos({ open: center(cfg.open), get: center(cfg.get) });
    read();
    const t = window.setInterval(read, 150);
    return () => window.clearInterval(t);
  }, [cfg]);

  // בשלבי הפתיחה הסמן אצל כפתור הצפייה; אחר כך אצל כפתור ההורדה. בלי כפתור צפייה (תיקייה שלמה) – רק הורדה
  const opening = cfg.sheet && phase <= 2;
  const target = opening ? pos.open : pos.get;
  if (!target) return null;
  const pressed = phase === 1 || phase === 4;
  const startOff: Pt = { x: target.x + 90, y: target.y + 120 };
  const cursor = phase === 0 && !cfg.sheet ? startOff : phase === 0 ? { x: target.x + 90, y: target.y + 120 } : target;
  const sheetOpen = cfg.sheet && phase === 2;
  const done = phase === 5;

  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden>
      <style>{`
        @keyframes td-ripple{0%{transform:translate(-50%,-50%) scale(.3);opacity:.9}100%{transform:translate(-50%,-50%) scale(1.6);opacity:0}}
        @keyframes td-sheet{from{opacity:0;transform:translateY(10px) scale(.85)}to{opacity:1;transform:none}}
        @keyframes td-bubble{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
      `}</style>

      {pressed && (
        <span
          className="absolute h-14 w-14 rounded-full border-4 border-sun"
          style={{ left: target.x, top: target.y, animation: "td-ripple .45s ease-out" }}
        />
      )}

      {sheetOpen && pos.open && (
        <div
          className="absolute w-[150px] rounded-md border-2 border-black bg-[#fffdf5] p-2.5 shadow-2xl"
          style={{
            left: Math.min(Math.max(pos.open.x - 75, 8), window.innerWidth - 158),
            top: Math.max(pos.open.y - 215, 8),
            animation: "td-sheet .35s ease-out",
          }}
        >
          <div className="text-[10px] font-bold text-black">דף לתלמידה</div>
          {[88, 100, 70, 94, 60, 100, 82, 90].map((w, i) => (
            <div key={i} className="mt-1.5 h-1.5 rounded-full bg-black/25" style={{ width: `${w}%` }} />
          ))}
          <div className="mt-2 text-center text-[10px] font-semibold text-black/70">הדף נפתח באתר</div>
        </div>
      )}

      {done && (
        <div
          className="absolute right-4 flex w-[260px] items-center gap-3 rounded-xl border border-white/30 bg-white px-3 py-2.5 text-black shadow-2xl"
          style={{ top: 84, animation: "td-bubble .3s ease-out" }}
        >
          {kind === "zip" ? <FileArchive className="h-7 w-7 shrink-0 text-[#16244e]" /> : <FileText className="h-7 w-7 shrink-0 text-[#16244e]" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{cfg.file}</div>
            <div className="text-xs text-black/60">ירד לתיקיית ההורדות</div>
          </div>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2e9d57] text-white">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
        </div>
      )}

      <svg
        className="absolute drop-shadow-lg"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        style={{
          left: 0,
          top: 0,
          transform: `translate(${cursor.x - 3}px, ${cursor.y - 2}px) scale(${pressed ? 0.85 : 1})`,
          transition: "transform .8s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <path d="M4 2l15 9-6.5 1.6L9 19z" fill="#fff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}


/** פעולות של תרחיש הדגמה: הסיור מפעיל בעצמו את הרכיבים האמיתיים בעמוד (סמן שנע, לוחץ, מקליד) */
export type Act =
  | { say: string | null }
  | { spot: string | null }
  | { move: string }
  | { click: string; optional?: boolean }
  | { ensure: [string, string] }
  | { type: [string, string] }
  | { select: string }
  | { wait: number };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** האלמנט כבר "התעורר" (React חיבר לו מאזינים): לחיצה לפני כן לא עושה כלום */
const isHydrated = (e: Element) => Object.keys(e).some((k) => k.startsWith("__reactProps"));
const isVisible = (e: HTMLElement) => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function TourScript({
  acts,
  onSay,
  onSpot,
  onDone,
}: {
  acts: Act[];
  onSay: (text: string | null) => void;
  onSpot: (el: HTMLElement | null) => void;
  /** נקראת פעם אחת כשכל פעולות התרחיש הסתיימו */
  onDone?: () => void;
}) {
  const [cur, setCur] = useState<Pt | null>(null);

  useEffect(() => {
    let dead = false;
    const find = async (sel: string, needLive = false, ms = 30000) => {
      const t0 = Date.now();
      while (!dead && Date.now() - t0 < ms) {
        const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find(isVisible);
        if (el && (!needLive || isHydrated(el) || Date.now() - t0 > 2500)) return el;
        await sleep(120);
      }
      return null;
    };
    const centerOf = (el: HTMLElement): Pt => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const moveTo = async (el: HTMLElement) => {
      setCur(centerOf(el));
      await sleep(950);
    };
    // מגלל את העמוד כך שהאלמנט יהיה באזור הפנוי: מתחת לכרטיס ההסבר (--tour-top) ומעל כפתור ״המשך״
    const reveal = async (el: HTMLElement) => {
      if (el.closest("dialog")) {
        el.scrollIntoView({ block: "nearest" });
        return;
      }
      const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tour-top")) || 100;
      const bottom = window.innerHeight - 100;
      const r = el.getBoundingClientRect();
      if (r.top >= top && r.bottom <= bottom) return;
      const want = r.height > bottom - top ? top : top + (bottom - top - r.height) / 2;
      window.scrollBy({ top: r.top - want, behavior: "smooth" });
      await sleep(600);
    };
    // ריצה שכבר בוטלה (למשל הרצה כפולה של האפקט במצב פיתוח) לא נוגעת יותר בעמוד: אחרת שתי ריצות לוחצות על אותו כפתור ומבטלות זו את זו
    (async () => {
      for (const a of acts) {
        if (dead) return;
        if ("say" in a) onSay(a.say);
        else if ("wait" in a) await sleep(a.wait);
        else if ("spot" in a) {
          if (a.spot === null) onSpot(null);
          else {
            const el = await find(a.spot);
            if (el && !dead) {
              // אלמנט שמחוץ לאזור הנראה (או צמוד לקצה) – מגללים אותו לאזור הפנוי כדי שיהיה ברור מה מוצג
              await reveal(el);
              if (dead) return;
              onSpot(el);
            }
          }
        } else if ("move" in a) {
          const el = await find(a.move);
          if (el && !dead) await moveTo(el);
        } else if ("click" in a) {
          const el = await find(a.click, true, a.optional ? 4000 : 30000);
          if (!el || dead) continue;
          await reveal(el);
          await moveTo(el);
          if (dead) return;
          await sleep(250);
          if (dead) return;
          el.click();
          await sleep(600);
        } else if ("type" in a) {
          const el = await find(a.type[0], true);
          if (!el || dead) continue;
          await reveal(el);
          await moveTo(el);
          if (dead) return;
          el.focus({ preventScroll: true });
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          let v = "";
          for (const ch of a.type[1]) {
            if (dead) return;
            v += ch;
            setter?.call(el, v);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            await sleep(55);
          }
        } else if ("ensure" in a) {
          // אם הסימון בקובץ לא הצליח (למשל הקובץ עדיין נטען), ממלאים את שדה הציטוט ישירות
          const el = await find(a.ensure[0], true, 4000);
          if (!el || dead || (el as HTMLTextAreaElement).value) continue;
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
          setter?.call(el, a.ensure[1]);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          await sleep(500);
        } else if ("select" in a) {
          // מסמנת קטע טקסט בקובץ שנפתח בחלון, בדיוק כמו שהמורה מסמנת בעכבר
          const box = await find(a.select);
          if (!box || dead) continue;
          let span: HTMLElement | undefined;
          for (let i = 0; i < 300 && !dead && !span; i++) {
            const spans = Array.from(box.querySelectorAll<HTMLElement>(".textLayer span")).filter(
              (s) => s.children.length === 0 && (s.textContent ?? "").trim().length >= 8 && isVisible(s),
            );
            span = spans[Math.min(2, spans.length - 1)];
            if (!span) await sleep(150);
          }
          if (!span || !span.firstChild || dead) continue;
          await moveTo(span);
          if (dead) return;
          const range = document.createRange();
          range.selectNodeContents(span);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          span.closest(".pdfv-scroll")?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          await sleep(500);
        }
      }
      if (!dead) onDone?.();
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acts]);

  if (!cur) return null;
  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden>
      <svg
        className="absolute drop-shadow-lg"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        style={{
          left: 0,
          top: 0,
          transform: `translate(${cur.x - 3}px, ${cur.y - 2}px)`,
          transition: "transform .8s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <path d="M4 2l15 9-6.5 1.6L9 19z" fill="#fff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
