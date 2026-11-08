import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

/**
 * robots.txt. חוסם סריקה רק למה שאין בו ערך לחיפוש או שדורש התחברות (API, ניהול, אזור אישי, תשלום, פורום).
 * דפים שרק לא רוצים באינדקס (התחברות, הרשמה, תצוגות מקדימות...) נשארים פתוחים לסריקה עם <meta noindex>:
 * ב-robots.txt אסור לחסום דף שרוצים להעביר לו noindex, כי גוגל חייבת לסרוק אותו כדי לראות את ההוראה.
 * לא חוסמים /_next/ (CSS/JS שגוגל צריכה כדי לרנדר את הדף) ולא תמונות.
 * פריסות תצוגה מקדימה של Vercel (לא production) נחסמות לגמרי.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/account/", "/checkout", "/pay", "/sell", "/forum/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
