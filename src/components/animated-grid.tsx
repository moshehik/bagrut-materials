import type { CSSProperties, ReactNode } from "react";

/**
 * רשת עם כניסה מדורגת (stagger) של הילדים – לשימוש ברכיבי שרת:
 * <AnimatedGrid className="grid ..."> {items.map(...)} </AnimatedGrid>
 *
 * האנימציה היא CSS בלבד (animate-fade-up + השהיה): התוכן גלוי כברירת מחדל,
 * כך שאם האנימציה לא רצה (חלון מוסתר, JS שלא נטען, מפחיתי-תנועה) הכרטיסים עדיין מוצגים —
 * בניגוד לגרסה הקודמת שהסתירה אותם (opacity 0) עד שאנימציית JS הופעלה.
 */
export function AnimatedGrid({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode[] | ReactNode;
  className?: string;
  delay?: number;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className={className}>
      {items.map((child, i) => (
        <div
          key={i}
          className="animate-fade-up"
          style={{ animationDelay: `${delay + Math.min(i, 12) * 0.05}s` } as CSSProperties}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/** בלוק בודד שנכנס בעדינות (גלוי כברירת מחדל, ראו AnimatedGrid) */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`animate-fade-up ${className}`}
      style={{ animationDelay: `${delay}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}
