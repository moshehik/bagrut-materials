import Link from "next/link";
import { Home, Mail } from "lucide-react";
import styles from "./error-sheet.module.css";

/** "אין עדיין מקצועות במאגר" — אותו דף מחברת של דף התקלה, עם אגוז שלם וחותמת "בקרוב". */
export function EmptySheet() {
  return (
    <div className={styles.wrap}>
      <section className={styles.sheet}>
        <span className={styles.tape} aria-hidden />
        <div className={styles.holes} aria-hidden>
          <span />
          <span />
          <span />
        </div>

        <span className={styles.bsd}>בס&quot;ד</span>

        <div className={styles.nutBox} aria-hidden>
          <svg className={styles.nut} viewBox="0 0 120 130">
            <path
              className={styles.shell}
              d="M60 14c26 0 46 22 46 52 0 30-18 50-46 50S14 96 14 66c0-30 20-52 46-52z"
            />
            <path d="M44 22c8-8 24-8 32 0" />
            <path d="M30 60c4-18 14-28 24-32" />
            <ellipse cx="60" cy="124" rx="30" ry="3" />
          </svg>
        </div>

        <div className={styles.stamp}>בקרוב</div>

        <h1 className={styles.headline}>המדפים עוד ריקים</h1>
        <p className={styles.text}>
          עדיין אין מקצועות במאגר. <span className={styles.mark}>התיקיות הראשונות בדרך</span> —
          חזרי בקרוב!
        </p>

        <div className={styles.actions}>
          <Link href="/" className="btn btn-primary">
            <Home className="h-4 w-4" aria-hidden /> לדף הבית
          </Link>
          <Link href="/contact" className="btn btn-ghost">
            <Mail className="h-4 w-4" aria-hidden /> כתבי לנו
          </Link>
        </div>
      </section>
    </div>
  );
}
