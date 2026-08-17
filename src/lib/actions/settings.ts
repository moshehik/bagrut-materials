"use server";

import { revalidatePath } from "next/cache";
import { lt } from "drizzle-orm";
import { db } from "@/db";
import { settings, pageViews, auditLogs, emailLogs } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { SETTING_DEFS, getSettings, getNumber, type SettingKey } from "@/lib/settings";
import type { AdminActionState } from "@/lib/actions/admin";

async function admin() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

function normalize(key: SettingKey, raw: string): string {
  const def = SETTING_DEFS[key];
  if (def.type === "boolean") return raw === "true" || raw === "on" || raw === "1" ? "true" : "false";
  if (def.type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? String(n) : def.default;
  }
  return raw.trim().slice(0, 5000);
}

/**
 * שמירת כל ההגדרות מהטופס. מפתחות boolean שלא נשלחו (checkbox לא מסומן) נחשבים false –
 * הטופס שולח שדה נסתר `__keys` עם רשימת המפתחות שהוצגו.
 */
export async function updateSettings(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };

  const current = await getSettings();
  const shown = String(form.get("__keys") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((k): k is SettingKey => k in SETTING_DEFS);
  const keys: SettingKey[] = shown.length ? shown : (Object.keys(SETTING_DEFS) as SettingKey[]);

  const changed: Record<string, { from: string; to: string }> = {};
  const now = new Date();
  try {
    for (const key of keys) {
      const raw = form.get(key);
      const value = normalize(key, raw === null ? (SETTING_DEFS[key].type === "boolean" ? "false" : current[key]) : String(raw));
      if (value === current[key]) continue;
      changed[key] = { from: current[key], to: value };
      await db
        .insert(settings)
        .values({ key, value, updatedAt: now, updatedById: me.id })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: now, updatedById: me.id },
        });
    }
  } catch (e) {
    return { error: "שגיאה בשמירה: " + (e instanceof Error ? e.message : String(e)) };
  }

  const changedKeys = Object.keys(changed);
  if (changedKeys.length) {
    await logAudit({
      actorId: me.id,
      action: "settings.update",
      entityType: "settings",
      details: { keys: changedKeys, changes: changed },
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** הפעלה/כיבוי מהיר של מצב תחזוקה */
export async function toggleMaintenance(): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const current = await getSettings();
  const value = current.maintenance_mode === "true" ? "false" : "true";
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: "maintenance_mode", value, updatedAt: now, updatedById: me.id })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now, updatedById: me.id },
    });
  await logAudit({
    actorId: me.id,
    action: "settings.update",
    entityType: "settings",
    details: { keys: ["maintenance_mode"], changes: { maintenance_mode: { from: current.maintenance_mode, to: value } } },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** מחיקת לוגים ישנים מ-logs_retention_days ימים */
export async function purgeOldLogs(): Promise<AdminActionState & { deleted?: number }> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const days = await getNumber("logs_retention_days");
  if (!Number.isFinite(days) || days < 1) return { error: "ימי שמירת לוגים לא תקינים (מינימום 1)" };
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let deleted = 0;
  try {
    const a = await db.delete(pageViews).where(lt(pageViews.createdAt, cutoff)).returning({ id: pageViews.id });
    const b = await db.delete(emailLogs).where(lt(emailLogs.sentAt, cutoff)).returning({ id: emailLogs.id });
    const c = await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)).returning({ id: auditLogs.id });
    deleted = a.length + b.length + c.length;
    await logAudit({
      actorId: me.id,
      action: "logs.purge",
      entityType: "logs",
      details: { days, cutoff, pageViews: a.length, emailLogs: b.length, auditLogs: c.length },
    });
  } catch (e) {
    return { error: "שגיאה במחיקה: " + (e instanceof Error ? e.message : String(e)) };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, deleted };
}

