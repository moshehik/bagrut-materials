import "server-only";
import { db } from "@/db";
import { categories } from "@/db/schema";

/**
 * שמות עבריים לכתובות עמודים בעמודי הניהול (במקום /subjects/torah/3-units/…):
 * עמודים קבועים – ממפה ידנית; /subjects/… – לפי שרשרת הקטגוריות (כותרות עבריות מה-DB).
 * `short` = שם העמוד עצמו (מילה-שתיים), `full` = השרשרת המלאה. כתובת לא מוכרת נשארת כמו שהיא.
 */
const STATIC: Record<string, string> = {
  "/": "דף הבית",
  "/subjects": "כל המקצועות",
  "/login": "התחברות",
  "/register": "הרשמה",
  "/map": "מפת החומרים",
  "/pricing": "מחירון ומנויים",
  "/account": "האזור האישי",
  "/account/downloads": "ההורדות שלי",
  "/account/payments": "התשלומים שלי",
  "/account/subjects": "בחירת מקצועות",
  "/account/phone": "השלמת טלפון",
  "/pay": "תשלום",
  "/checkout": "קופה",
  "/search": "חיפוש",
  "/forum": "פורום",
  "/sell": "מכירת חומרים",
  "/coupons": "קופונים",
  "/cart": "עגלת קניות",
  "/contact": "יצירת קשר",
  "/terms": "תקנון",
  "/privacy": "מדיניות פרטיות",
  "/forgot-password": "שחזור סיסמה",
  "/reset-password": "איפוס סיסמה",
  "/verify-email": "אימות מייל",
};

export type PathLabel = { short: string; full: string };
export type PathLabeler = (rawPath: string) => PathLabel;

export async function loadPathLabeler(): Promise<PathLabeler> {
  let byPath = new Map<string, string[]>();
  try {
    const rows = await db.select({ id: categories.id, parentId: categories.parentId, slug: categories.slug, title: categories.title }).from(categories);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of rows) {
      const slugs: string[] = [];
      const titles: string[] = [];
      let cur: (typeof rows)[number] | undefined = r;
      for (let i = 0; cur && i < 20; i++) {
        slugs.unshift(cur.slug);
        titles.unshift(cur.title);
        cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined;
      }
      byPath.set(slugs.join("/"), titles);
    }
  } catch (e) {
    console.error("[path-labels] categories load failed", e instanceof Error ? e.message : e);
    byPath = new Map();
  }

  return (rawPath: string): PathLabel => {
    const clean = (rawPath.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
    const fixed = STATIC[clean];
    if (fixed) return { short: fixed, full: fixed };
    if (clean.startsWith("/subjects/")) {
      let key = clean.slice("/subjects/".length);
      try {
        key = decodeURIComponent(key);
      } catch {}
      const titles = byPath.get(key);
      if (titles?.length) return { short: titles[titles.length - 1], full: titles.join(" › ") };
    }
    if (clean.startsWith("/admin")) return { short: "ניהול", full: "אזור הניהול" };
    if (clean.startsWith("/forum/")) return { short: "שרשור בפורום", full: "שרשור בפורום" };
    return { short: clean, full: clean };
  };
}
