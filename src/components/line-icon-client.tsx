"use client";

import { LINE_ICONS } from "@/lib/line-icons.generated";

/**
 * איור קו כ-SVG מוטמע בדף (ר' line-icon.tsx).
 * רכיב לקוח בכוונה: כרכיב שרת, נתיב האיור (10KB ומעלה) היה נכנס פעמיים למסמך – פעם ב-HTML ופעם בנתוני ה-RSC שבתוכו (כ-100% תוספת).
 * כרכיב לקוח ב-RSC עובר רק השם, והנתיב מגיע מהחבילה (קובץ JS שנשמר במטמון) וב-HTML מופיע פעם אחת.
 */
export function LineIcon({
  name,
  className,
  color,
  style,
  size,
}: {
  name: string;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
  /** מידות מוצגות בפיקסלים (מרובע שהאיור נכנס בו); בלי זה – מידות לפי CSS */
  size?: number;
}) {
  const icon = LINE_ICONS[name];
  if (!icon) return null;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${icon.w} ${icon.h}`}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      style={{ color, ...style }}
    >
      <path d={icon.d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
