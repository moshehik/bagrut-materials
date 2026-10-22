"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { limitKey, rateLimit, TOO_MANY_MESSAGE } from "@/lib/rate-limit";
import { SECRET_DEFS, deleteSecret, getNedarimApiPassword, isSecretName, redactNedarim, setSecret } from "@/lib/nedarim/secrets";
import { cancelIntent, getById, manualSettle } from "@/lib/nedarim/store";
import { matchPendingPayments, refreshHistory } from "@/lib/nedarim/sync";

/**
 * פעולות המנהלת על התשלומים בנדרים (/admin/payments). כל פעולה: אדמין בלבד (admin()), הבדיקה המובנית של Next ל-server actions
 * (Origin מול Host), rate-limit היכן שיש קריאה חיצונית, logAudit בלי ערכי סודות. docs/nedarim-payments.md
 */
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

/** "רענון עכשיו" – קריאה אחת ל-GetHistoryJson דרך השער (רצפה של דקה למנהלת) + התאמה */
export async function refreshNedarimNow(): Promise<NedarimAdminState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const rl = await rateLimit({ key: limitKey("nedarim-refresh", "user", me.id), limit: 10, windowSec: 600 });
  if (!rl.ok) return { error: TOO_MANY_MESSAGE };
  const r = await refreshHistory("admin");
  if (!r.ran) {
    const m = await matchPendingPayments();
    await logAudit({ actorId: me.id, action: "nedarim.refresh", details: { ran: false, reason: r.reason, matched: m.settled.length } });
    revalidate();
    return { ok: true, reason: `${r.reason}. בוצעה התאמה מול המטמון (${m.settled.length} שודרגו).` };
  }
  await logAudit({ actorId: me.id, action: "nedarim.refresh", details: { ran: true, ok: r.ok, reason: r.reason, fetched: r.fetched } });
  revalidate();
  return r.ok ? { ok: true, reason: r.reason } : { error: r.reason };
}

/** "אמת מחדש" על בקשה אחת = רענון (אם השער מרשה) + התאמה; השורה עצמה מתעדכנת אם נמצאה עסקה */
export async function reverifyNedarimPayment(id: number): Promise<NedarimAdminState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const row = await getById(id);
  if (!row) return { error: "בקשה לא נמצאה" };
  const r = await refreshNedarimNow();
  const fresh = await getById(id);
  if (r.error) return r;
  return { ok: true, status: fresh?.status ?? row.status, reason: fresh?.status === "paid" ? "נמצאה עסקה – המנוי נפתח" : `${r.reason ?? ""} לא נמצאה עסקה מתאימה לבקשה הזו`.trim() };
}

/** "אשר ידנית" – אחרי שהמנהלת ראתה את התשלום בפורטל נדרים / קיבלה אותו בדרך אחרת. transactionId אופציונלי (מהפורטל). */
export async function manualSettleNedarimPayment(id: number, transactionId?: string): Promise<NedarimAdminState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const tid = (transactionId ?? "").trim();
  if (tid && !/^\d{1,30}$/.test(tid)) return { error: "מספר עסקה לא תקין (ספרות בלבד)" };
  const r = await manualSettle(id, me.id, tid || null);
  await logAudit({ actorId: me.id, action: "nedarim.manual_settle", entityType: "nedarim_payment", entityId: id, details: { transactionId: tid || null, result: r } });
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

/* ---------- סודות (app_secrets) ---------- */

export type SecretActionState = { ok?: true; error?: string; message?: string } | undefined;

/**
 * החלפת סוד (דריסה). הערך מגיע רק מה-FormData, מאומת בפורמט, מוצפן ונשמר – ולא מופיע בתשובה, באודיט, בלוג או בשגיאה.
 */
export async function setNedarimSecret(_prev: SecretActionState, form: FormData): Promise<SecretActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const name = form.get("name");
  if (!isSecretName(name)) return { error: "סוד לא מוכר" };
  const rl = await rateLimit({ key: limitKey("secret-set", "user", me.id), limit: 10, windowSec: 600 });
  if (!rl.ok) return { error: TOO_MANY_MESSAGE };
  const raw = form.get("value");
  const value = typeof raw === "string" ? raw.trim() : "";
  const def = SECRET_DEFS[name];
  if (!value) return { error: "יש להזין ערך" };
  if (value.length > 256 || !def.pattern.test(value)) return { error: `הערך לא בפורמט הצפוי: ${def.hint}` };
  try {
    await setSecret(name, value, me.id);
  } catch (e) {
    const msg = redactNedarim(e instanceof Error ? e.message : "error").slice(0, 160);
    await logAudit({ actorId: me.id, action: "secret.set_failed", entityType: "app_secret", details: { name, error: msg } });
    return { error: /relation .* does not exist/i.test(msg) ? "טבלת app_secrets עדיין לא קיימת – להריץ את scripts/create-nedarim-tables.ts --apply" : `השמירה נכשלה: ${msg}` };
  }
  // אודיט בלי הערך – רק מי, מה, מתי (ו-4 תווים אחרונים כדי לזהות החלפה)
  await logAudit({ actorId: me.id, action: "secret.set", entityType: "app_secret", details: { name, last4: value.length >= 12 ? value.slice(-4) : null } });
  revalidatePath("/admin/payments");
  return { ok: true, message: `${def.label} נשמר (מוצפן). נכנס לתוקף מיד – בלי פריסה.` };
}

export async function removeNedarimSecret(name: string): Promise<SecretActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!isSecretName(name)) return { error: "סוד לא מוכר" };
  const rl = await rateLimit({ key: limitKey("secret-set", "user", me.id), limit: 10, windowSec: 600 });
  if (!rl.ok) return { error: TOO_MANY_MESSAGE };
  try {
    const removed = await deleteSecret(name);
    await logAudit({ actorId: me.id, action: "secret.remove", entityType: "app_secret", details: { name, removed } });
    revalidatePath("/admin/payments");
    return { ok: true, message: removed ? "הוסר מה-DB. אם יש ערך במשתני הסביבה – הוא זה שבתוקף עכשיו." : "לא היה ערך שמור ב-DB." };
  } catch (e) {
    return { error: `ההסרה נכשלה: ${redactNedarim(e instanceof Error ? e.message : "error").slice(0, 160)}` };
  }
}

/**
 * "בדיקת מפתח": קריאה אחת ל-GetHistoryJson דרך אותו שער קריאה (רצפה של דקה) עם המפתח שבתוקף (DB/env).
 * מחזיר הצלחה/כישלון בלבד – לא תוכן ולא את המפתח. 3 ל-10 דק' למנהלת.
 */
export async function testNedarimApiKey(): Promise<SecretActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const rl = await rateLimit({ key: limitKey("secret-test", "user", me.id), limit: 3, windowSec: 600 });
  if (!rl.ok) return { error: TOO_MANY_MESSAGE };
  if (!(await getNedarimApiPassword())) return { error: "אין מפתח API מוגדר (לא ב-DB ולא ב-env)" };
  const r = await refreshHistory("test");
  await logAudit({ actorId: me.id, action: "secret.test", entityType: "app_secret", details: { name: "nedarim_api_password", ran: r.ran, ok: r.ok, reason: r.reason } });
  revalidatePath("/admin/payments");
  if (!r.ran) return { error: `לא ניתן לבדוק כרגע: ${r.reason}` };
  return r.ok ? { ok: true, message: `המפתח תקין – נדרים פלוס החזירו היסטוריה (${r.reason})` } : { error: `הבדיקה נכשלה: ${r.reason}` };
}
