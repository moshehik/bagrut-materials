"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { logAudit, requestMeta } from "@/lib/audit";
import { removePrivateVersion } from "@/lib/private-versions";

/**
 * המנהלת מסירה גרסה פרטית מתוקנת של מורה (ר' /admin/fixes): השורה מסומנת removed (לא נמחקת), הקובץ נשאר בדרייב
 * (מועבר ל"לא פעילות" עם שם מתאר), והמורה חוזרת לקבל את הקובץ המשותף. ההערה הכללית עצמה (material_fixes) לא משתנה.
 * נרשם ב-audit_logs (גם על ההערה – ציר הזמן) וביומן הסוכן.
 */
export async function removePrivateVersionAction(id: number): Promise<{ ok?: boolean; error?: string }> {
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return { error: "אין הרשאה" };
  }
  if (!Number.isInteger(id) || id <= 0) return { error: "מזהה לא תקין" };
  try {
    const { ip } = await requestMeta();
    const removed = await removePrivateVersion(id, { reason: "הוסרה ע\"י המנהלת", actorId: me.id, source: "admin", ip });
    if (!removed) return { error: "הגרסה לא נמצאה או כבר הוסרה" };
  } catch (e) {
    console.error("removePrivateVersionAction failed", e);
    return { error: "ההסרה נכשלה, נסי שוב" };
  }
  await logAudit({ actorId: me.id, action: "fix.private_version_remove", entityType: "material_private_version", entityId: id, details: { kept: true } });
  revalidatePath("/admin/fixes");
  revalidatePath("/subjects", "layout");
  return { ok: true };
}
