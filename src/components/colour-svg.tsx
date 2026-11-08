import type { CSSProperties } from "react";
import { COLOUR_SVGS } from "@/lib/colour-svgs.generated";

/**
 * איור צבעוני (אגוזים, בתים, אגוזי כפתורים) כ-SVG מוטמע בדף במקום קובץ תמונה.
 * למה: נטפרי חוסם כל תמונה שאינה קובץ רגיל, אבל <path> בתוך ה-HTML עובר (docs/netfree.md).
 * הנתונים נוצרים ב-scripts/gen-colour-svgs.cjs (צורות צבע שטוחות, לא צילום) לפי הנתיב המקורי של התמונה.
 * אין נתונים לנתיב → חוזרים ל-<img> רגיל. הרכיב ללא "use client": משתמשים בו מקומפוננטות שרת בלבד;
 * קומפוננטות לקוח מקבלות את האיור כ-ReactNode מההורה (כדי לא להכניס את כל הנתונים לחבילת הלקוח).
 */

/** קיים וקטור לנתיב הזה? */
export const hasColourSvg = (src: string | undefined): src is string => !!src && src in COLOUR_SVGS;

/** האם אגוזי הרשימות משותפים דרך <use> (כל נתיב מוגדר פעם אחת בעמוד ב-ColourSvgDefs). כבו אם נטפרי מפיל <use>. */
export const SHARE_VIA_USE = true;

const idOf = (src: string) => "cs" + src.replace(/^\/images\//, "-").replace(/[^a-zA-Z0-9]+/g, "-");

/** אגוזי הכפתורים והכרטיסיות שחוזרים בעמודי תיקייה/שיחות/תצוגות כרטיס – ההגדרות המשותפות שלהם */
export const CARD_NUT_SRCS = [
  "/images/mat-cards/nut-download.webp@s",
  "/images/mat-cards/nut-download-light.webp@s",
  "/images/nuts/one-01.webp@s",
  "/images/nuts/one-02.webp@s",
  "/images/nuts/one-10.webp@s",
  "/images/nuts/many-03.webp", // אגוז כרטיס הפורום (גדול)
];

type Props = {
  /** הנתיב המקורי של התמונה, למשל "/images/nuts/many-03.webp" */
  src: string;
  className?: string;
  style?: CSSProperties;
  /** מאפייני width/height כמו ב-<img> המקורי (CSS גובר עליהם) */
  width?: number;
  height?: number;
  /**
   * true = ציור באמצעות <use> של הגדרה משותפת (חייבים לרנדר ColourSvgDefs באותו עמוד) – לאגוז שחוזר הרבה פעמים בעמוד
   * (כרטיסי תיקיות), כדי לא לשכפל עשרות KB של נתיב בכל כרטיס.
   */
  shared?: boolean;
  /** גרסה קטנה (פי 2-4 פחות נתונים) לתצוגה עד ~80px: כפתורים, אגוז כרטיס תיקייה, בתים ברשימות בחירה – אם קיימת למפתח ("…@s") */
  small?: boolean;
  /** אם הקופסה גבוהה מהאיור: "bottom" = האיור יושב בתחתית (כמו object-position: bottom של ה-<img> הישן) */
  align?: "bottom";
};

/**
 * רק תמונות ש**נטפרי חוסם סופית** ("נחסם על ידי AI") מוצגות כ-SVG; שאר האגוזים/הבתים נשארים קובץ תמונה רגיל, כי הם עוברים
 * (אחרי בדיקה חד-פעמית של נטפרי) באיכות המלאה, ואילו ה-SVG מוריד איכות (נבדק אצל המורה, 2026-11-08). אם עוד תמונה נחסמת –
 * מוסיפים אותה לכאן. (המפתחות קיימים ב-colour-svgs.generated.ts לכל התמונות.)
 */
// 2026-11-08: נטפרי עדיין מציג את שני הבתים האלה כ"בבדיקה/נחסם" (בתים אחרים אושרו) – לכן SVG. הבעיה בסידור (גובה 266px מתכונת height) תוקנה: height:auto.
const SVG_ONLY = new Set(["/images/houses/house-yahadut.png", "/images/houses/house-ezrachut.png", "/images/edge-logo.png"]);

export function ColourSvg({ src, className, style, width, height, shared, small, align }: Props) {
  const key = small && src + "@s" in COLOUR_SVGS ? src + "@s" : src;
  const data = SVG_ONLY.has(src) ? COLOUR_SVGS[key] : undefined;
  if (!data) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={width} height={height} className={className} style={style} aria-hidden />;
  }
  const cls = className ? `colour-svg ${className}` : "colour-svg";
  const useShared = shared && SHARE_VIA_USE;
  return (
    <svg className={cls} style={{ height: "auto", ...style }} viewBox={`0 0 ${data.w} ${data.h}`} preserveAspectRatio={align === "bottom" ? "xMidYMax meet" : undefined} width={width} height={height} aria-hidden focusable="false">
      {useShared ? (
        <use href={`#${idOf(key)}`} />
      ) : (
        data.layers.map((l, i) => <path key={i} d={l.d} fill={l.fill} fillRule="evenodd" />)
      )}
    </svg>
  );
}

/** הגדרות משותפות ל-<ColourSvg shared> – מרנדרים פעם אחת בעמוד, עם כל הנתיבים שמופיעים בו */
export function ColourSvgDefs({ srcs }: { srcs: (string | undefined)[] }) {
  if (!SHARE_VIA_USE) return null;
  const uniq = [...new Set(srcs.filter((s): s is string => !!s && SVG_ONLY.has(s) && s in COLOUR_SVGS))];
  if (!uniq.length) return null;
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        {uniq.map((src) => (
          <g key={src} id={idOf(src)}>
            {COLOUR_SVGS[src].layers.map((l, i) => (
              <path key={i} d={l.d} fill={l.fill} fillRule="evenodd" />
            ))}
          </g>
        ))}
      </defs>
    </svg>
  );
}
