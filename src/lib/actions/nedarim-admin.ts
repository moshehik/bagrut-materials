"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { loadNedarimConfig } from "@/lib/nedarim/config";
import { cancelIntent, getById, manualSettle, reverify } from "@/lib/nedarim/store";

/** פעולות המנהלת על בקשות תשלום בנדרים (/admin/payments). docs/nedarim-payments.md */
export type NedarimAdminState = { ok?: true; error?: string; status?: string; reason?: string };

async function admin() {
  const u = await getCurrentUser();
  return u && u.role === "admin" ? u : null;
}
const revalidate = () => {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/finance");
};

/** "אמת מחדש" – קריאה אחת ל-GetHistoryJson (מוגבל ל-20 בשעה אצל נדרים) */
export async function reverifyNedarimPayment(id: number): Promise<NedarimAdminState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const cfg = await loadNedarimConfig();
  if (!cfg.hasApiPassword) return { error: "אין מפתח API (NEDARIM_API_PASSWORD) – אפשר לאשר ידנית אחרי בדיקה בפורטל נדרים" };
  const r = await reverify(id, cfg);
  await logAudit({ actorId: me.id, action: "nedarim.reverify", entityType: "nedarim_payment", entityId: id, details: r });
  revalidate();
  if (!r.ok) return { error: r.error };
  return { ok: true, status: r.status, reason: r.reason };
}

/** "אשר ידנית" – אחרי שהמנהלת ראתה את התשלום בפורטל נדרים / קיבלה אותו בדרך אחרת. פותח את המנוי. */
export async function manualSettleNedarimPayment(id: number): Promise<NedarimAdminState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const row = await getById(id);
  if (!row) return { error: "בקשה לא נמצאה" };
  if (row.status === "paid") return { error: "הבקשה כבר הושלמה" };
  if (row.status === "cancelled" || row.status === "expired") return { error: "בקשה שבוטלה/פגה – ליצור בקשה חדשה או מנוי ידני ב«מנויים»" };
  const cfg = await loadNedarimConfig();
  const r = await manualSettle(id, me.id, cfg);
  await logAudit({ actorId: me.id, action: "nedarim.manual_settle", entityType: "nedarim_payment", entityId: id, details: r });
  revalidate();
  if (!r.ok) return { error: r.error };
  return { ok: true, status: r.status, reason: r.reason };
}

export async function cancelNedarimPayment(id: number, reason: string): Promise<NedarimAdminState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const r = await cancelIntent(id, me.id, reason.trim().slice(0, 300));
  await logAudit({ actorId: me.id, action: "nedarim.cancel", entityType: "nedarim_payment", entityId: id, details: { reason, result: r } });
  revalidate();
  if (!r.ok) return { error: r.error };
  return { ok: true, status: r.status };
}
