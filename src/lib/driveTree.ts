import "server-only";
import { logAudit } from "@/lib/audit";

/** נקודת הכניסה של קוד האתר לעץ הדרייב (הליבה ב-driveTreeCore.ts, בלי server-only כדי שסקריפטים יוכלו לייבא אותה). */
export * from "./driveTreeCore";

/**
 * מריץ סנכרון דרייב "בצד" פעולת ניהול קיימת: כשל בדרייב לא מפיל את הפעולה (ה-DB כבר עודכן),
 * אלא נרשם ב-audit_logs כ-drive.sync_failed — ואפשר לתקן אחר כך מהסייר ("סנכרון עם הדרייב").
 */
export async function driveSafe<T>(actorId: number | null, label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    await logAudit({
      actorId,
      action: "drive.sync_failed",
      details: { label, error: e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : "unknown" },
    });
    return undefined;
  }
}
