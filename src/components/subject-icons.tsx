import type { ReactNode, SVGProps } from "react";
import s from "./subject-icons.module.css";

/** אייקוני קו דק, שחורים, מודרניים — אחד לכל מקצוע. מוצג כשלתיקייה/מקצוע אין בית מאויר או תמונה משלו */

function Base({ children, className, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${s.icon} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </svg>
  );
}

type IconFn = (props: SVGProps<SVGSVGElement>) => ReactNode;

const ICONS: Record<string, IconFn> = {
  /** תורה — מגילה עם שני עמודי עץ */
  torah: (p) => (
    <Base {...p}>
      <rect x="14" y="10" width="20" height="28" rx="2" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="38" r="3" />
      <circle cx="38" cy="10" r="3" />
      <circle cx="38" cy="38" r="3" />
      <path d="M19 19h10M19 24h10M19 29h6" />
    </Base>
  ),
  /** נביא — שופר */
  navi: (p) => (
    <Base {...p}>
      <path d="M10 34c0-14 11-24 24-22" />
      <circle cx="10" cy="34" r="3" />
      <path d="M32 11c2 1 3 4 2 7" />
      <path d="M36 16l6-2M35 21l6 1" />
    </Base>
  ),
  /** כתובים — נבל */
  ktuvim: (p) => (
    <Base {...p}>
      <path d="M12 40V10l22 5v25" />
      <path d="M12 40c4-3 10-3 14 0" />
      <path d="M16 15v23M20 16v22M24 17v22M28 18v21" />
    </Base>
  ),
  /** לשון — נוצה כותבת */
  lashon: (p) => (
    <Base {...p}>
      <path d="M14 34 32 16" />
      <path d="M32 16l4-4 4 4-4 4z" />
      <path d="M12 38l4-4" />
      <path d="M8 42h16" />
    </Base>
  ),
  /** ספרות — ספר פתוח */
  sifrut: (p) => (
    <Base {...p}>
      <path d="M6 14l18 4 18-4v22l-18 4-18-4z" />
      <path d="M24 18v22" />
      <path d="M10 20l11 2M10 26l11 2" />
      <path d="M38 20l-11 2M38 26l-11 2" />
    </Base>
  ),
  /** אנגלית — כדור הארץ */
  english: (p) => (
    <Base {...p}>
      <circle cx="24" cy="24" r="16" />
      <ellipse cx="24" cy="24" rx="7" ry="16" />
      <path d="M8 24h32" />
    </Base>
  ),
  /** יהדות — נר */
  yahadut: (p) => (
    <Base {...p}>
      <rect x="20" y="20" width="8" height="22" rx="1.5" />
      <path d="M24 18c-3-4 0-8 0-8s3 4 0 8z" />
      <path d="M10 42h28" />
    </Base>
  ),
  /** מתמטיקה — מחוגה */
  math: (p) => (
    <Base {...p}>
      <circle cx="24" cy="9" r="2" />
      <path d="M24 11 14 40M24 11l10 29" />
      <path d="M10 44a14 14 0 0 1 28 0" />
    </Base>
  ),
  /** דינים — מאזני צדק */
  dinim: (p) => (
    <Base {...p}>
      <path d="M24 8v30" />
      <path d="M10 14h28" />
      <path d="M16 38h16" />
      <path d="M10 14l-6 10a6 6 0 0 0 12 0z" />
      <path d="M38 14l-6 10a6 6 0 0 0 12 0z" />
    </Base>
  ),
  /** היסטוריה — עמוד מקדש */
  history: (p) => (
    <Base {...p}>
      <path d="M8 10h32" />
      <path d="M10 14h28" />
      <path d="M14 14v24M24 14v24M34 14v24" />
      <path d="M8 42h32" />
      <path d="M10 38h28" />
    </Base>
  ),
  /** אזרחות — מסמך עם אישור */
  ezrachut: (p) => (
    <Base {...p}>
      <path d="M12 5h16l8 8v30H12z" />
      <path d="M28 5v8h8" />
      <path d="M17 34l4 4 8-9" />
      <path d="M17 21h5M17 26h9" />
    </Base>
  ),
  /** שיחה — שתי בועות דיבור */
  sicha: (p) => (
    <Base {...p}>
      <path d="M6 10h22v14H16l-4 4v-4H6z" />
      <path d="M22 20h20v14h-6l-4 4v-4H22z" />
    </Base>
  ),
  /** חברה — שתי דמויות */
  chevra: (p) => (
    <Base {...p}>
      <circle cx="17" cy="15" r="6" />
      <path d="M6 40c0-8 5-12 11-12s11 4 11 12" />
      <circle cx="34" cy="19" r="5" />
      <path d="M26 40c0.5-6 4-10 8-10s8 4 8.5 9" />
    </Base>
  ),
  /** הרחבת ידע למורה — כובע טקס */
  teacher: (p) => (
    <Base {...p}>
      <path d="M24 10 4 18l20 8 20-8z" />
      <path d="M14 22v8c0 3 5 5 10 5s10-2 10-5v-8" />
      <path d="M40 18v14" />
      <circle cx="40" cy="34" r="1.6" />
    </Base>
  ),
  /** מגילות — מגילה מגולגלת */
  megilot: (p) => (
    <Base {...p}>
      <ellipse cx="12" cy="24" rx="5" ry="9" />
      <path d="M12 15h20v18H12" />
      <path d="M20 21h10M20 27h10" />
    </Base>
  ),
  /** מנהל וכלכלה — גרף עולה */
  minhal: (p) => (
    <Base {...p}>
      <path d="M8 40h32" />
      <rect x="12" y="28" width="6" height="12" />
      <rect x="21" y="20" width="6" height="20" />
      <rect x="30" y="12" width="6" height="28" />
    </Base>
  ),
  /** חינוך פיננסי — מטבע עם סימן שקל */
  "chinuch-pinansi": (p) => (
    <Base {...p}>
      <circle cx="24" cy="24" r="16" />
      <path d="M20 16v20M28 16v3.5" />
      <path d="M18 20h9a3.5 3.5 0 0 1 0 7h-6a3.5 3.5 0 0 0 0 7h9" />
    </Base>
  ),
};

/** ברירת מחדל — בית פשוט, למקצוע/תיקייה שאין להם עדיין אייקון ייעודי */
const DEFAULT_ICON: IconFn = (p) => (
  <Base {...p}>
    <path d="M7 23 24 8 41 23" />
    <path d="M11 23v15h26V23" />
    <path d="M20 38v-9h8v9" />
  </Base>
);

export function SubjectIcon({ slug, className }: { slug?: string | null; className?: string }) {
  const Icon = (slug && ICONS[slug]) || DEFAULT_ICON;
  return <Icon className={className} />;
}
