import { LINE_ICONS } from "@/lib/line-icons.generated";

/** האם יש לשם הזה איור קו וקטורי (ר' scripts/gen-line-icons.cjs) */
export const hasLineIcon = (name: string) => name in LINE_ICONS;

/**
 * איור קו כ-SVG מוטמע בדף (במקום קובץ תמונה): נטפרי חוסם תמונות (גם data URI) אבל SVG בתוך ה-HTML עובר.
 * הצבע לפי currentColor (color של האלמנט / color prop); fill-rule evenodd כדי שהקווים לא יתמלאו.
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
