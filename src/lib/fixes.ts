import "server-only";
import { and, asc, eq, inArray, max, or } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes } from "@/db/schema";
import { compactText } from "@/lib/docx-fixes";

/** own = התיקון של המורה עצמה (בקשה שהגישה) – חל אצלה מיד, בלי תלות בהחלטת הסוכן על שאר המורות */
export type PublicFix = {
  id: number;
  number: number;
  originalText: string;
  correctedText: string;
  own: boolean;
  /** כשהטקסט חוזר כמה פעמים: כמה מופעים קדמו למקום שהמורה סימנה (מאפס) – ר' DocxFix.occurrence */
  occurrence?: number;
};

/**
 * התיקונים שמוצגים למבקרת: המפורסמים (לכולן) + התיקונים ה"פרטיים" שלה עצמה (status "private" –
 * הסוכן בדק ולא החליט לשלב בקובץ המקורי, אז התיקון נשאר רק אצל המורה שביקשה אותו) + הבקשות שלה
 * שעוד ממתינות לסוכן (status "pending"): היא רואה ומורידה את התיקון שלה מיד, והסוכן מחליט אחר כך
 * אם לשלב אותו בקובץ לכל המורות. לבקשה ממתינה אין עדיין מספר קבוע – מוצג לה מספר זמני אחרי
 * המספרים הקיימים בחומר, והמספר הקבוע ניתן כשהסוכן מחליט. שגיאת DB לא מפילה את הדף.
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
          and(inArray(materialFixes.status, ["private", "pending"]), eq(materialFixes.userId, userId)),
        )
      : eq(materialFixes.status, "published");
    const rows = await db
      .select()
      .from(materialFixes)
      .where(and(inArray(materialFixes.materialId, materialIds), visible))
      .orderBy(asc(materialFixes.fixNumber), asc(materialFixes.id));

    // מספרים זמניים לממתינות: אחרי המספר הגבוה ביותר שכבר ניתן לחומר (בכל סטטוס, גם של מורות אחרות)
    const pending = rows.filter((r) => r.status === "pending");
    const nextTemp = new Map<number, number>();
    if (pending.length > 0) {
      const maxes = await db
        .select({ materialId: materialFixes.materialId, m: max(materialFixes.fixNumber) })
        .from(materialFixes)
        .where(inArray(materialFixes.materialId, [...new Set(pending.map((r) => r.materialId))]))
        .groupBy(materialFixes.materialId);
      for (const x of maxes) nextTemp.set(x.materialId, (x.m ?? 0) + 1);
    }

    for (const r of rows) {
      let number = r.fixNumber;
      let original = r.originalText;
      let corrected = r.correctedText;
      if (r.status === "pending") {
        // הטקסט שסומנה והתיקון שכתבה, כפי שנשמרו בבקשה
        original = r.quoteText;
        corrected = r.requestText;
        number = nextTemp.get(r.materialId) ?? 1;
        nextTemp.set(r.materialId, number + 1);
      }
      if (number == null || !original || !corrected) continue;
      const list = out.get(r.materialId) ?? [];
      list.push({
        id: r.id,
        number,
        originalText: original,
        correctedText: corrected,
        own: r.status !== "published",
        // המופע נשמר ביחס לטקסט שסומן; אם הסוכן/מנהלת ניסחו טקסט מקורי אחר – לא חל עליו (אין משמעות למספר)
        occurrence: r.occurrence != null && (r.status === "pending" || compactText(original) === compactText(r.quoteText ?? "")) ? r.occurrence : undefined,
      });
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
