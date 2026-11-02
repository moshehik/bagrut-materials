"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sichot, sichaVideos, type Status } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { driveTrash, driveSafe } from "@/lib/driveTree";

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

export async function setSichaVideoStatus(id: number, status: Status) {
  const me = await requireAdmin().catch(() => null);
  if (!me) return { error: "אין הרשאה" };
  await db.update(sichaVideos).set({ status }).where(eq(sichaVideos.id, id));
  await logAudit({
    actorId: me.id,
    action: "sicha.video.status",
    entityType: "sicha_video",
    entityId: id,
    details: { to: status },
  });
  revalidatePath("/admin/sichot");
  revalidatePath("/subjects", "layout");
  return { ok: true };
}

export async function deleteSichaVideo(id: number) {
  const me = await requireAdmin().catch(() => null);
  if (!me) return { error: "אין הרשאה" };
  const [prev] = await db.select({ driveId: sichaVideos.driveId }).from(sichaVideos).where(eq(sichaVideos.id, id)).limit(1);
  await db.delete(sichaVideos).where(eq(sichaVideos.id, id));
  if (prev) await driveSafe(me.id, `sicha-video trash ${id}`, () => driveTrash(prev.driveId));
  await logAudit({
    actorId: me.id,
    action: "sicha.video.delete",
    entityType: "sicha_video",
    entityId: id,
    details: {},
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
