import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { siteUrl } from "@/lib/mail";

/**
 * קידום אתרים (SEO) – הגדרות משותפות. מקור אחד לכתובת האתר: siteUrl() (NEXT_PUBLIC_SITE_URL, ואם לא – הכתובת הפעילה ב-mail.ts).
 * כשהדומיין loozhainyan.app יופעל מחליפים רק שם (או מגדירים NEXT_PUBLIC_SITE_URL) – robots, sitemap, canonical ו-JSON-LD עוברים יחד.
 * בלי "server-only" בכוונה – נבדק בסקריפטים.
 */

/** כתובת האתר בלי סלאש בסוף */
export function siteOrigin(): string {
  return siteUrl().replace(/\/+$/, "");
}

/** כתובת מוחלטת מנתיב ("/subjects/torah" → "https://…/subjects/torah"). נתיב ריק/"/" = דף הבית */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${p === "/" ? "" : p}`;
}

/** כותרת ותיאור ברירת המחדל של האתר (דף הבית ושיתוף) */
export const SEO_DEFAULT_TITLE = `${SITE_NAME} – שיעורים מוכנים למורות לבגרות`;
export const SEO_DEFAULT_DESCRIPTION =
  "דפי שכפול לתלמידה ולמורה, בחנים, שאלות מבגרויות ומצגות, מסודרים לפי מפת הבגרות עד הפרק המדויק. " + SITE_TAGLINE + ".";

/** תמונת השיתוף (1200×630, ר' scripts/make-og-image.cjs). הכתובת קבועה בכוונה – כתובת חדשה נבדקת מחדש בנטפרי */
export const OG_IMAGE_PATH = "/images/og-image.png";

/** שמות נוספים שבהם מחפשים את האתר (גרשיים/בלי) – ל-WebSite.alternateName */
export const SITE_ALTERNATE_NAMES = ["לוז העניין", 'לו"ז העניין', "לוח זמנים העניין"];

/** JSON-LD בטוח להזרקה ל-<script>: מבריח "<" כדי שמחרוזת בתוכן לא תסגור את התג (ר' docs/01-app/02-guides/json-ld.md ב-Next) */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** אתר + ארגון – מוזרק בדף הבית בלבד */
export function homeJsonLd() {
  const origin = siteOrigin();
  const logo = `${origin}/images/logo-black.png`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      name: SITE_NAME,
      url: origin,
      logo,
      description: SITE_TAGLINE,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${origin}/#website`,
      url: origin,
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAMES,
      inLanguage: "he-IL",
      publisher: { "@id": `${origin}/#organization` },
    },
  ];
}

/** פירורי לחם לעמוד תיקייה: [{name, path}] מהשורש אל התיקייה הנוכחית */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
      ...items.map((it, i) => ({ "@type": "ListItem", position: i + 2, name: it.name, item: absoluteUrl(it.path) })),
    ],
  };
}

/**
 * מטא לעמוד פנימי: כתובת קנונית (בלי פרמטרים) + שיתוף. openGraph בעמוד מחליף את זה של ה-layout כולו (לא ממוזג),
 * ולכן כאן חוזרים גם סוג/שפה/שם האתר/התמונה. title כאן הוא הכותרת המלאה (בלי תבנית " | שם האתר") – כך היא מוצגת בשיתוף.
 */
export function pageSeo(opts: { title: string; description?: string; path: string }) {
  const description = opts.description || SEO_DEFAULT_DESCRIPTION;
  return {
    description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: "website" as const,
      locale: "he_IL",
      siteName: SITE_NAME,
      title: `${opts.title} | ${SITE_NAME}`,
      description,
      url: opts.path,
      images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: SITE_NAME }],
    },
  };
}
