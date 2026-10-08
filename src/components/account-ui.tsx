import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, Filter, UserRound } from "lucide-react";
import { formatHebrewDate } from "@/lib/hebrew-date";
import { CARD_ROWS, CARD_STYLES, EXTRA_TYPES, type CardType } from "@/lib/material-card-types";

/** רכיבי האזור האישי (שרת): כותרת עמוד, חלונית כחולה והודעת סטטוס – בעיצוב חלוניות "שימי לב!" */

export const AccountArrow = () => (
  <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
);

/** כפתור חזרה לתפריט האזור האישי (חץ ימינה – כיוון חזרה בעברית) */
export function BackButton({ href = "/account", label = "חזרה לאזור האישי" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="btn btn-gold btn-gate mt-3 py-1.5">
      <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden /> {label}
    </Link>
  );
}

/** כותרת עמוד: לוגו + כותרת בכתב היד; בעמודי משנה גם קישור חזרה לתפריט */
export function AccountTitle({
  title,
  subtitle,
  back,
  backHref = "/account",
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  backHref?: string;
  eyebrow?: boolean;
}) {
  return (
    <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-x-8 gap-y-3 text-center sm:flex-row sm:text-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-44 sm:w-52" />
      <div>
        {eyebrow && (
          <p className="flex items-center justify-center gap-1 sm:justify-start">
            <UserRound className="h-4 w-4" aria-hidden /> האזור האישי
          </p>
        )}
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-md">{subtitle}</p>}
        {back && <BackButton href={backHref} />}
      </div>
    </div>
  );
}

/** הודעת סטטוס בחלונית כחולה קטנה */
export function Notice({
  icon: Icon,
  alert,
  children,
}: {
  icon: typeof UserRound;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role={alert ? "alert" : "status"}
      className={`gate-panel mx-auto mt-6 flex max-w-3xl items-center gap-3 animate-pop ${
        alert ? "text-[#ffd9d2]" : "text-[#ffd45a]"
      }`}
    >
      <span className="gold-ring" aria-hidden="true" />
      <Icon className="h-6 w-6 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

/** חלונית כחולה עם טבעת זהב וכותרת עם איקון */
export function Panel({
  id,
  title,
  icon: Icon,
  aside,
  children,
}: {
  id: string;
  title: string;
  icon: typeof UserRound;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8" aria-labelledby={id}>
      <span className="gold-ring" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 id={id} className="flex items-center gap-3 text-3xl">
          <span className="gate-icon !h-11 !w-11 shrink-0">
            <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </span>
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** תאריך עברי ("כ״ד בתשרי תשפ״ז"); בלי תאריך – "ללא הגבלה" (תוקף פתוח) */
export const fmtDate = (d: Date | null) => (d ? formatHebrewDate(d) : "ללא הגבלה");

/** חלונות התפריט – לכל אחד תמונת אגוזים שונה */
const TILES = [
  {
    href: "/account/downloads/calendar",
    title: "ההורדות שלי",
    text: "לוח שנה עברי: מתי הורדת ומה, עם הורדה חוזרת",
    nut: "/images/nuts/many-04.webp",
  },
  {
    href: "/account/details",
    title: "הנתונים שלי",
    text: "פרטים אישיים, מספר אישי, שינוי סיסמה ומייל",
    nut: "/images/nuts/two-04.webp",
  },
  {
    href: "/account/interests",
    title: "מקצועות שמעניינים אותי",
    text: "בחירת המקצועות להתאמת עדכונים והמלצות",
    nut: "/images/nuts/many-12.webp",
  },
  {
    href: "/account/purchases",
    title: "רכישות ומנויים",
    text: "המנויים הפעילים, ההורדות שנותרו ותוקף",
    nut: "/images/nuts/many-08.webp",
  },
  {
    href: "/account/payments",
    title: "היסטוריית תשלומים",
    text: "חיובים וזיכויים לפי תאריך",
    nut: "/images/nuts/many-15.webp",
  },
  {
    href: "/pricing",
    title: "מסלולים ומחירים",
    text: "לראות את המסלולים ולהצטרף",
    nut: "/images/nuts/many-01.webp",
  },
];


/** חלונות התפריט: מלבן לכל עמוד, עם תמונת אגוזים שונה; לחיצה פותחת את העמוד */
export function AccountMenu({ hrefs }: { hrefs?: Record<string, string> }) {
  return (
    <nav className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8" aria-label="האזור האישי">
      <span className="gold-ring" aria-hidden="true" />
      <ul className="grid gap-5 sm:grid-cols-2">
        {TILES.map((t) => (
          <li key={t.href}>
            <Link href={hrefs?.[t.href] ?? t.href} className="gate-card gate-pick acc-tile">
              <span className="min-w-0 flex-1">
                <span className="block text-2xl leading-tight">{t.title}</span>
                <span className="gate-soft mt-1 block text-base leading-snug">{t.text}</span>
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.nut} alt="" aria-hidden className="acc-tile-nut" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** תמונת האגוזים של כל מסלול – אותן תמונות כמו בעמוד המסלולים (plan-nuts) */
const PLAN_NUT: Record<string, string> = {
  single: "single",
  bundle: "single",
  yearly: "yearly",
  custom_monthly: "substitute",
  subject_monthly: "substitute",
  substitute_3m: "substitute",
  substitute_daily: "daily",
  substitute: "substitute",
  daily: "daily",
};

export function PlanNut({ plan, className = "acc-plan-nut" }: { plan: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/images/plan-nuts/${PLAN_NUT[plan] ?? "single"}.png`}
      alt=""
      aria-hidden
      className={className}
    />
  );
}

/** סוגי ההורדה לסינון (אותו סדר כמו בתיקייה), ו"אחר" לבסוף */
export const TYPE_FILTERS: (CardType | "forum" | "other")[] = [...CARD_ROWS.flat(), ...EXTRA_TYPES.filter((t) => t !== "generic"), "forum", "other"];

export const typeLabel = (t: CardType | "forum" | "other" | null) =>
  t === "forum" ? "פורום" : t && t !== "other" ? CARD_STYLES[t].label : "חומר נוסף";

/** הגדלה לאייקונים שהקו שלהם דק ורחב עם הרבה רווח (שאלות מבגרויות וכד'), כדי שיראו כמו האחרים */
const ICON_ZOOM: Record<string, number> = {
  skills: 1.3,
  forum: 1.35,
};

/** תמונות רחבות מאוד עם הדמות במרכז: חותכים מהמרכז במקום לדחוס לרוחב התיבה */
const ICON_COVER = new Set<string>(["exam", "exam-answers", "dictation"]);

/** אייקון סוג ההורדה – אותם אייקונים כמו בכרטיסי השיעור (lesson-icons-v2), בתיבה בגודל קבוע */
export function TypeIcon({
  type,
  className = "h-7 w-7",
}: {
  type: CardType | "forum" | "other" | null;
  className?: string;
}) {
  // סוג בלי אייקון צבעוני בתיקיית lesson-icons-v2 (סוגים נוספים וחומר שלא זוהה): הדמות הקווית הלבנה על עיגול בצבע הכרטיסייה
  const extraType = !type || type === "other" ? "generic" : type !== "forum" && CARD_STYLES[type].extra ? type : null;
  if (extraType) {
    return (
      <span className={`grid shrink-0 place-items-center ${className}`} aria-hidden>
        <span
          className="grid aspect-square h-full max-h-8 place-items-center rounded-full"
          style={{ background: CARD_STYLES[extraType].strip }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/images/mat-cards/art4/${CARD_STYLES[extraType].art}.svg`} alt="" className="h-[78%] w-[78%] object-contain" />
        </span>
      </span>
    );
  }
  const art = type === "forum" ? "forum" : CARD_STYLES[type as CardType].art;
  return (
    <span className={`acc-ico relative grid shrink-0 place-items-center ${ICON_COVER.has(type) ? "overflow-hidden" : ""} ${className}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/images/lesson-icons-v2/${art}.png`}
        alt=""
        className={ICON_COVER.has(type) ? "h-full w-full object-cover object-center" : "max-h-full max-w-full object-contain"}
        style={ICON_ZOOM[type] ? { transform: `scale(${ICON_ZOOM[type]})` } : undefined}
      />
    </span>
  );
}

/**
 * סינון לפי סוג ההורדה: מוסתר עד שלוחצים על "סנן לפי סוג הקובץ" (נשאר פתוח כשיש סינון פעיל).
 * בפנים: "הכל" + צ׳יפ עם אייקון לכל סוג. hrefFor(undefined) = בלי סינון.
 */
export function TypeFilter({ active, hrefFor }: { active?: string; hrefFor: (type?: string) => string }) {
  return (
    <details className="acc-edit" open={!!active}>
      <summary className="!justify-start">
        <span className="btn btn-gate acc-filter-btn py-1.5">
          <Filter className="acc-filter-ico h-4 w-4" aria-hidden /> סנן לפי סוג הקובץ
          {active && <span className="opacity-80"> · {typeLabel(active as CardType | "forum" | "other")}</span>}
          <ChevronDown className="acc-edit-chev h-4 w-4 transition-transform" aria-hidden />
        </span>
      </summary>
      <nav className="acc-chips mt-3" aria-label="סינון לפי סוג ההורדה">
        <Link href={hrefFor(undefined)} scroll={false} className={`acc-chip${!active ? " acc-chip-on" : ""}`}>
          הכל
        </Link>
        {TYPE_FILTERS.map((t) => (
          <Link
            key={t}
            href={hrefFor(t)}
            scroll={false}
            className={`acc-chip${active === t ? " acc-chip-on" : ""}`}
            aria-current={active === t ? "true" : undefined}
          >
            <TypeIcon type={t} className="h-8 w-10" /> {typeLabel(t)}
          </Link>
        ))}
      </nav>
    </details>
  );
}
