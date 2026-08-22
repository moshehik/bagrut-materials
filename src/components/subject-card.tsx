import Link from "next/link";
import type { CSSProperties } from "react";
import { SUBJECT_HOUSES, SUBJECT_HOUSE_COLORS } from "@/lib/constants";
import { SubjectIcon } from "./subject-icons";
import s from "./subject-card.module.css";

type Props = {
  href: string;
  title: string;
  slug?: string;
  /** slug של המקצוע השורשי — לבחירת האייקון המתאים בתיקיות מקוננות (יחידות/נושאים/פרקים) */
  rootSlug?: string;
  description?: string | null;
  questionnaireCode?: string | null;
  count?: number;
  countLabel?: string;
  color?: string | null;
  size?: "md" | "lg";
};

/**
 * כרטיס "בית" — אותה שפה עיצובית כמו רשת המקצועות בדף הבית, לכל רמות הניווט
 * (מקצועות, יחידות, פנימי/חיצוני, נושאים ופרקים).
 */
export function SubjectCard({
  href,
  title,
  slug,
  rootSlug,
  description,
  questionnaireCode,
  count,
  countLabel = "חומרים",
  color,
  size = "md",
}: Props) {
  const house = slug ? SUBJECT_HOUSES[slug] : undefined;
  const accent = color || (slug ? SUBJECT_HOUSE_COLORS[slug] : undefined) || "var(--blue)";
  const big = size === "lg";

  return (
    <Link
      href={href}
      className={`${s.card} ${big ? s.big : ""}`}
      aria-label={`פתיחת ${title}`}
    >
      <div className={s.arch} style={{ "--accent": accent } as CSSProperties}>
        {house ? (
          <div className={s.houseWrap}>
            <img className={s.house} src={house} alt={title} width={356} height={266} />
          </div>
        ) : (
          <SubjectIcon slug={rootSlug || slug} className={s.folderIcon} />
        )}
      </div>
      {!house && <h3 className={s.title}>{title}</h3>}
      {description && <p className={s.desc}>{description}</p>}
      {(questionnaireCode || typeof count === "number") && (
        <div className={s.meta}>
          {questionnaireCode && <span className={s.code}>שאלון {questionnaireCode}</span>}
          {typeof count === "number" && (
            <span className={s.count}>
              {count} {countLabel}
            </span>
          )}
        </div>
      )}
      <em className={s.go}>לחומרים ←</em>
    </Link>
  );
}
