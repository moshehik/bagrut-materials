import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { getIndexableCategoryPaths } from "@/lib/seo-data";

// נבנה מחדש לכל היותר פעם בשעה (שאילתה אחת למסד); בלי lastModified בכוונה: גוגל משתמשת בו רק אם הוא מדויק תמיד,
// ובאתר אין תאריך "שונה לאחרונה" אמין לתיקייה. priority/changefreq גוגל מתעלמת מהם.
export const revalidate = 3600;

const STATIC_PATHS = ["/", "/subjects", "/map", "/pricing", "/contact", "/accessibility", "/terms", "/privacy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const folders = await getIndexableCategoryPaths();
  return [
    ...STATIC_PATHS.map((p) => ({ url: absoluteUrl(p) })),
    ...folders.map((p) => ({ url: absoluteUrl(`/subjects/${p}`) })),
  ];
}
