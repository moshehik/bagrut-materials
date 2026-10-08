import Link from "next/link";
import { RefreshCw, Home, Mail } from "lucide-react";
import styles from "./error-sheet.module.css";

/** דף תקלה בסגנון "פנקס המורה": דף מחברת, חותמת אדומה, אגוז סדוק וכתב-יד. */
export function ErrorSheet({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className={styles.wrap}>
      <section className={styles.sheet} role="alert">
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
            <path className={styles.crack} d="M62 16l-9 22 14 14-13 18 11 14-8 18" />
            <line className={styles.spark} x1="96" y1="22" x2="106" y2="12" />
            <line className={styles.spark} x1="104" y1="38" x2="116" y2="36" />
            <line className={styles.spark} x1="22" y1="26" x2="12" y2="16" />
            <ellipse cx="60" cy="124" rx="30" ry="3" />
          </svg>
        </div>

        <div className={styles.stamp}>תקלה</div>

        <h1 className={styles.headline}>אופס… משהו נסדק בדרך</h1>
        <p className={styles.text}>
          הדף לא נטען כמו שצריך. <span className={styles.mark}>זה לא משהו שעשית</span> —
          נסי לרענן, ואם התקלה חוזרת, כתבי לנו ונטפל בה מהר.
        </p>


        <div className={styles.actions}>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="btn btn-primary">
              <RefreshCw className="h-4 w-4" aria-hidden /> נסי שוב
            </button>
          ) : (
            <Link href="/" className="btn btn-primary">
              <RefreshCw className="h-4 w-4" aria-hidden /> נסי שוב
            </Link>
          )}
          <Link href="/" className="btn btn-ghost">
            <Home className="h-4 w-4" aria-hidden /> לדף הבית
          </Link>
          <Link href="/contact" className="btn btn-ghost">
            <Mail className="h-4 w-4" aria-hidden /> דווחי על התקלה
          </Link>
        </div>
      </section>
    </div>
  );
}
