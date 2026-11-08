"use server";

import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { clampFillLinePercent } from "@/lib/fill-line-pref";
import { getFillLinePercent, setFillLinePercent } from "@/lib/user-prefs";

/**
 * ההגדרות האישיות של המורה המחוברת. כרגע: יחס אורך קווי-המילוי (fill-line-pref.ts). חלונית ההגדרה באתר תקרא לשתי
 * הפעולות האלה; ההורדה/התצוגה כבר קוראות את ההגדרה בעצמן (ר' api/download, api/preview, api/download-folder).
 */

export type PreferencesState = { ok?: boolean; error?: string; fillLinePercent?: number };

/** ההגדרה הנוכחית (100 = ברירת מחדל). */
export async function getMyPreferencesAction(): Promise<PreferencesState> {
  const user = await requireUser();
  return { ok: true, fillLinePercent: await getFillLinePercent(user.id) };
}

/** שמירת יחס אורך קווי-המילוי. ערך שאינו מספר נדחה; מספר מעוגל לצעד ומוגבל לטווח. 100 = חזרה לברירת המחדל. */
export async function setFillLinePercentAction(percent: number | string): Promise<PreferencesState> {
  const user = await requireUser();
  if (typeof percent === "string" ? percent.trim() === "" || !Number.isFinite(Number(percent)) : !Number.isFinite(percent)) {
    return { error: "ערך לא תקין" };
  }
  const value = clampFillLinePercent(percent);
  try {
    const before = await getFillLinePercent(user.id);
    await setFillLinePercent(user.id, value);
    await logAudit({
      actorId: user.id,
      action: "profile.update_fill_lines",
      entityType: "user",
      entityId: user.id,
      details: { from: before, to: value },
    });
  } catch (e) {
    console.error("setFillLinePercentAction failed", e);
    return { error: "לא ניתן לשמור את ההגדרה כרגע, נסי שוב בעוד רגע" };
  }
  return { ok: true, fillLinePercent: value };
}
