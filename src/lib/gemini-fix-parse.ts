/** פענוח תשובת ג'מיני לתיקון – מודול טהור (בלי DB), כדי שאפשר יהיה לבדוק אותו ביחידה */

/** כתב זר (ערבית, קירילית, סינית וכו') בתוך עברית – מסמן תשובה פגומה של המודל */
export const FOREIGN_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿Ѐ-ӿ぀-ヿ㐀-鿿가-힯]/;

/** מנקה את תשובת ג'מיני: JSON → corrected; מסיר גדרות קוד שנדבקו */
export function parseGeminiFix(raw: string): { corrected: string; reason?: string } | null {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const j = JSON.parse(s) as { corrected?: unknown; reason?: unknown };
    if (typeof j.corrected !== "string") return null;
    return { corrected: j.corrected.trim(), reason: typeof j.reason === "string" ? j.reason : undefined };
  } catch {
    const m = /"corrected"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s);
    if (!m) return null;
    try {
      return { corrected: (JSON.parse(`"${m[1]}"`) as string).trim() };
    } catch {
      return null;
    }
  }
}
