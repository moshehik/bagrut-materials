import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMirrorMap } from "@/lib/data";

/**
 * נתיבי התיקיות שכדאי שגוגל יאנדקס (למפת האתר): תיקייה פעילה, כל שרשרת האבות שלה פעילה, ויש בה (או באחד מצאצאיה)
 * לפחות חומר פעיל שהקובץ שלו בדרייב – כלומר מה שמבקרת באמת רואה. תיקייה משקפת (CATEGORY_MIRRORS) נחשבת כבעלת חומרי תיקיית המקור.
 * מחזיר נתיב slugs מקודד ("torah/3-units/…", בלי "/subjects/" ובלי סלאש בתחילה). שגיאת DB = רשימה ריקה (המפה הסטטית עדיין מוגשת).
 */
export async function getIndexableCategoryPaths(): Promise<string[]> {
  try {
    const withMat = await db.execute<{ category_id: number }>(
      sql`SELECT DISTINCT category_id FROM materials WHERE status = 'active' AND file_url LIKE 'drive://%'`,
    );
    const base = new Set<number>(withMat.rows.map((r) => Number(r.category_id)));
    // תיקייה משקפת מציגה את חומרי המקור: אם למקור יש חומר – גם לה
    for (const [dst, src] of await getMirrorMap()) if (base.has(src)) base.add(dst);
    if (base.size === 0) return [];

    const ids = sql.join([...base].map((n) => sql`${n}::int`), sql`, `);
    const rows = await db.execute<{ path: string }>(sql`
      WITH RECURSIVE tree AS (
        SELECT id, slug::text AS path FROM categories WHERE parent_id IS NULL AND status = 'active'
        UNION ALL
        SELECT c.id, t.path || '/' || c.slug FROM categories c JOIN tree t ON c.parent_id = t.id WHERE c.status = 'active'
      ),
      up AS (
        SELECT id, parent_id FROM categories WHERE id IN (${ids})
        UNION
        SELECT c.id, c.parent_id FROM categories c JOIN up u ON c.id = u.parent_id
      )
      SELECT t.path FROM tree t WHERE t.id IN (SELECT id FROM up) ORDER BY t.path
    `);
    return rows.rows.map((r) => r.path.split("/").map(encodeURIComponent).join("/"));
  } catch (e) {
    console.error("[sitemap] failed to load indexable categories", e);
    return [];
  }
}
