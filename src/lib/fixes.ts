import "server-only";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes } from "@/db/schema";

export type PublicFix = { id: number; number: number; originalText: string; correctedText: string };

/**
 * התיקונים שמוצגים למבקרת: המפורסמים (לכולן) + התיקונים ה"פרטיים" שלה עצמה (status "private" –
 * הסוכן בדק ולא החליט לשלב בקובץ המקורי, אז התיקון נשאר רק אצל המורה שביקשה אותו).
 * שגיאת DB לא מפילה את הדף.
 */
export async function getFixesForViewer(
  materialIds: number[],
  userId: number | null | undefined,
): Promise<Map<number, PublicFix[]>> {
  const out = new Map<number, PublicFix[]>();
  if (materialIds.length === 0) return out;
  try {
    const visible = userId
      ? or(
          eq(materialFixes.status, "published"),
          and(eq(materialFixes.status, "private"), eq(materialFixes.userId, userId)),
        )
      : eq(materialFixes.status, "published");
    const rows = await db
      .select()
      .from(materialFixes)
      .where(and(inArray(materialFixes.materialId, materialIds), visible))
      .orderBy(asc(materialFixes.fixNumber));
    for (const r of rows) {
      if (r.fixNumber == null || !r.originalText || !r.correctedText) continue;
      const list = out.get(r.materialId) ?? [];
      list.push({ id: r.id, number: r.fixNumber, originalText: r.originalText, correctedText: r.correctedText });
      out.set(r.materialId, list);
    }
  } catch (e) {
    console.error("getFixesForViewer failed", e);
  }
  return out;
}

/** רק התיקונים המפורסמים (לכולן) */
export function getPublishedFixes(materialIds: number[]): Promise<Map<number, PublicFix[]>> {
  return getFixesForViewer(materialIds, null);
}

/** מפרסר ?fixes=all | ?fixes=3,7 → "all" (כל התיקונים) / רשימת מספרי תיקון / null (לא התבקשו תיקונים) */
export function parseFixesParam(v: string | null): "all" | number[] | null {
  if (!v) return null;
  if (v === "all") return "all";
  const nums = v
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  return nums.length ? [...new Set(nums)] : null;
}
