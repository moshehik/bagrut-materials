import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes } from "@/db/schema";

export type PublicFix = { id: number; number: number; originalText: string; correctedText: string };

/** התיקונים המפורסמים של קבוצת חומרים (חומר → תיקונים לפי מספר). שגיאת DB לא מפילה את הדף. */
export async function getPublishedFixes(materialIds: number[]): Promise<Map<number, PublicFix[]>> {
  const out = new Map<number, PublicFix[]>();
  if (materialIds.length === 0) return out;
  try {
    const rows = await db
      .select()
      .from(materialFixes)
      .where(and(inArray(materialFixes.materialId, materialIds), eq(materialFixes.status, "published")))
      .orderBy(asc(materialFixes.fixNumber));
    for (const r of rows) {
      if (r.fixNumber == null || !r.originalText || !r.correctedText) continue;
      const list = out.get(r.materialId) ?? [];
      list.push({ id: r.id, number: r.fixNumber, originalText: r.originalText, correctedText: r.correctedText });
      out.set(r.materialId, list);
    }
  } catch (e) {
    console.error("getPublishedFixes failed", e);
  }
  return out;
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
