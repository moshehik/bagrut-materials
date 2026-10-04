"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sichot, type Status } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export type AdminSichaState = { error?: string; ok?: boolean } | undefined;

/** כלי טיפול בדיעבד למנהלת — פרסום שיחות עצמו פתוח וללא אישור מראש */
export async function setSichaStatus(id: number, status: Status) {
  const me = await requireAdmin().catch(() => null);
  if (!me) return { error: "אין הרשאה" };
  const [prev] = await db
    .select({ title: sichot.title, status: sichot.status })
    .from(sichot)
    .where(eq(sichot.id, id))
    .limit(1);
  await db.update(sichot).set({ status }).where(eq(sichot.id, id));
  await logAudit({
    actorId: me.id,
    action: "sicha.status",
    entityType: "sicha",
    entityId: id,
    details: { title: prev?.title ?? null, from: prev?.status ?? null, to: status, status },
  });
  revalidatePath("/admin/sichot");
  revalidatePath("/subjects", "layout");
  return { ok: true };
}

export async function deleteSicha(id: number) {
  const me = await requireAdmin().catch(() => null);
  if (!me) return { error: "אין הרשאה" };
  const [prev] = await db
    .select({ title: sichot.title, status: sichot.status })
    .from(sichot)
    .where(eq(sichot.id, id))
    .limit(1);
  await db.delete(sichot).where(eq(sichot.id, id));
  await logAudit({
    actorId: me.id,
    action: "sicha.delete",
    entityType: "sicha",
    entityId: id,
    details: { title: prev?.title ?? null, status: prev?.status ?? null },
  });
  revalidatePath("/admin/sichot");
  revalidatePath("/subjects", "layout");
  return { ok: true };
}
