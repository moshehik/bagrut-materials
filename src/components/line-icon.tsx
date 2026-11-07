import { LINE_ICONS } from "@/lib/line-icons.generated";

export { LineIcon } from "@/components/line-icon-client";

/** האם יש לשם הזה איור קו וקטורי (ר' scripts/gen-line-icons.cjs) */
export const hasLineIcon = (name: string) => name in LINE_ICONS;

/*
 * איור קו כ-SVG מוטמע בדף (במקום קובץ תמונה): נטפרי חוסם תמונות (גם data URI) אבל SVG בתוך ה-HTML עובר.
 * הצבע לפי currentColor (color של האלמנט / color prop); fill-rule evenodd כדי שהקווים לא יתמלאו.
 * הרכיב עצמו ב-line-icon-client.tsx (רכיב לקוח, כדי שהנתיב לא יוכפל בנתוני ה-RSC).
 */
