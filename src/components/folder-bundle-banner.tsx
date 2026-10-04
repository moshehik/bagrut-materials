import Image from "next/image";
import { formatPrice } from "@/lib/constants";

type Props = {
  categoryId: number;
  /** מחיר הרכישה החד-פעמית של כל התיקייה, באגורות */
  price: number;
  /** האם כל הקבצים כבר שלה (מנוי / רכישה / מנהלת) – אז אין מחיר, והאגוז מוריד מיד את כל התיקייה */
  owned: boolean;
};

/**
 * אגוז בראש הכרטיסיות: רכישה חד-פעמית של כל הקבצים שבתיקייה (ואז הורדתם כקובץ ZIP אחד).
 * קישורים רגילים (<a>) ולא Link, כדי שאגוז הטעינה של ההורדות יזהה אותם.
 */
export function FolderBundleBanner({ categoryId, price, owned }: Props) {
  const href = owned ? `/api/download-folder/${categoryId}` : `/checkout?bundle=${categoryId}`;
  return (
    <a href={href} className="mtc-bundle" aria-label={owned ? "הורדת כל הקבצים בתיקייה" : `רכישה חד-פעמית של כל הקבצים בתיקייה, ${formatPrice(price)}`}>
      <Image src="/images/mat-cards/nut-download.webp" alt="" width={84} height={67} className="mtc-bundle-nut" aria-hidden />
      <span className="mtc-bundle-text">
        {owned ? "להורדה מיידית של כל הטוב הזה – לחצי על האגוז" : "לרכישה בודדת של כל הטוב הזה"}
      </span>
      {!owned && (
        <span className="mtc-bundle-price">
          {(price / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 })}
          <span className="mtc-bundle-shekel" aria-hidden>₪</span>
        </span>
      )}
    </a>
  );
}
