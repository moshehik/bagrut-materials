"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sichaVideos, sichaVideoIdeas, sichaVideoUsages, categories } from "@/db/schema";
import { requireAdmin, requireUser, getCurrentUser } from "@/lib/session";
import { adminEmail, sendMail, templates } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { TOO_MANY_MESSAGE, clientIp, limitKey, tooMany } from "@/lib/rate-limit";
import { parseDriveLink } from "@/lib/drive-link";
import { verifyUpload } from "@/lib/upload-id";
import { driveUrlFor } from "@/lib/driveBridge";
import { copySharedVideo, VideoCopyError } from "@/lib/drive-video-copy";
import { ensureCategoryFolder, driveTrash, driveSafe, sanitizeDriveName } from "@/lib/driveTree";

const videoSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  title: z.string().trim().min(4, "כותרת קצרה מדי").max(200, "כותרת ארוכה מדי"),
  description: z.string().trim().min(10, "צריך תיאור קצר של הסרטון (לפחות 10 תווים)").max(2000),
  /** קישור שיתוף מהדרייב (אם לא הועלה קובץ) */
  link: z.string().trim().max(500).optional(),
  /** קובץ שהועלה בגרירה/בחירה (ר' /api/sichot/video-upload): מזהה הקובץ בדרייב של האתר + חתימה */
  uploadedFileId: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/).optional(),
  uploadedSig: z.string().optional(),
  uploadedSize: z.coerce.number().int().nonnegative().optional(),
  displayName: z.string().trim().min(2, "שם בדוי קצר מדי").max(40, "שם בדוי ארוך מדי").optional(),
  path: z.string().min(1),
});

export type AddVideoInput = z.input<typeof videoSchema>;

/**
 * מורה משתפת קישור לסרטון בדרייב שלה; האתר מעתיק אותו (בצד השרת של גוגל) לדרייב של האתר,
 * פותח לעותק צפייה בקישור, ושומר את הקישור החדש — כך הסרטון לא נעלם אם המורה תמחק/תשנה את המקור.
 */
export async function addSichaVideo(input: AddVideoInput): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי לשתף סרטון" };
  if (user.suspended) return { error: "החשבון מושעה" };
  if (await tooMany(limitKey("sicha-video", "user", user.id), 10, 3600)) return { error: TOO_MANY_MESSAGE };

  const parsed = videoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { categoryId, title, description, link, uploadedFileId, uploadedSig, uploadedSize, displayName, path } = parsed.data;
  const uploaded = !!uploadedFileId;
  if (uploaded && !verifyUpload(user.id, driveUrlFor(uploadedFileId!), uploadedSig)) {
    return { error: "ההעלאה לא אומתה, נסי להעלות שוב" };
  }
  const drive = uploaded ? null : link ? parseDriveLink(link) : null;
  if (!uploaded) {
    if (!link) return { error: "גררי קובץ סרטון או הדביקי קישור מהדרייב" };
    if (!drive) return { error: "הקישור לא נראה כמו קישור שיתוף של גוגל דרייב (drive.google.com)" };
    if (drive.kind === "folder") return { error: "אפשר לשתף קובץ סרטון אחד בכל פעם (לא תיקייה). שתפי את קובץ הסרטון עצמו." };
  }

  const [cat] = await db
    .select({ contentModule: categories.contentModule, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!cat || cat.contentModule !== "sichot_videos") return { error: "התיקייה לא נמצאה" };

  if (drive) {
    const [dup] = await db
      .select({ id: sichaVideos.id })
      .from(sichaVideos)
      .where(and(eq(sichaVideos.categoryId, categoryId), eq(sichaVideos.sourceDriveId, drive.id)))
      .limit(1);
    if (dup) return { error: "הסרטון הזה כבר שותף בתיקייה" };
  }

  let copied: { fileId: string; size: number };
  if (uploaded) {
    copied = { fileId: uploadedFileId!, size: uploadedSize ?? 0 };
  } else
  try {
    const folderId = await ensureCategoryFolder(categoryId);
    copied = await copySharedVideo({
      sourceId: drive!.id,
      resourceKey: drive!.resourceKey,
      name: `${sanitizeDriveName(title).slice(0, 120)} – ${Date.now().toString(36)}`,
      parentId: folderId,
    });
  } catch (e) {
    if (e instanceof VideoCopyError) return { error: e.message };
    await logAudit({
      actorId: user.id,
      action: "sicha.video.copy_failed",
      entityType: "sicha_video",
      details: { error: e instanceof Error ? e.message.slice(0, 200) : "unknown" },
    });
    return { error: "לא הצלחנו להעתיק את הסרטון לדרייב של האתר. נסי שוב בעוד רגע." };
  }

  const [row] = await db
    .insert(sichaVideos)
    .values({
      categoryId,
      teacherId: user.id,
      title,
      description,
      driveId: copied.fileId,
      sourceDriveId: drive?.id ?? null,
      linkKind: "file",
      displayName: displayName ?? null,
    })
    .returning({ id: sichaVideos.id });

  await logAudit({
    actorId: user.id,
    action: "sicha.video.create",
    entityType: "sicha_video",
    entityId: row.id,
    details: { categoryId, size: copied.size, pseudonym: displayName ?? null },
  });
  revalidatePath(path);
  revalidatePath("/subjects", "layout");
  return { ok: true };
}

/** רק מנהלת האתר מוחקת סרטון; העותק בדרייב של האתר עובר לפח (המקור של המורה לא נוגעים בו) */
export async function deleteSichaVideo(id: number, path: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return { error: "רק מנהלת האתר יכולה למחוק סרטון" };
  const deleted = await db
    .delete(sichaVideos)
    .where(eq(sichaVideos.id, id))
    .returning({ id: sichaVideos.id, driveId: sichaVideos.driveId });
  if (deleted.length === 0) return { error: "הסרטון לא נמצא" };
  await driveSafe(admin.id, `sicha-video trash ${id}`, () => driveTrash(deleted[0].driveId));
  await logAudit({
    actorId: admin.id,
    action: "sicha.video.delete",
    entityType: "sicha_video",
    entityId: id,
    details: {},
  });
  revalidatePath(path);
  revalidatePath("/subjects", "layout");
  return { ok: true };
}

const videoIdeaSchema = z.object({
  videoId: z.coerce.number().int().positive(),
  body: z.string().trim().min(3, "כתבי רעיון קצת יותר מפורט").max(2000, "הרעיון ארוך מדי"),
  path: z.string().min(1),
});

/** מורה מוסיפה רעיון: למה הסרטון מתאים לשיעור (ואיך אפשר להשתמש בו) */
export async function addVideoIdea(
  _prev: { error?: string; ok?: boolean } | undefined,
  form: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי להוסיף רעיון" };
  if (user.suspended) return { error: "החשבון מושעה" };
  if (await tooMany(limitKey("sicha-video-idea", "user", user.id), 30, 3600)) return { error: TOO_MANY_MESSAGE };
  const parsed = videoIdeaSchema.safeParse({
    videoId: form.get("videoId"),
    body: form.get("body"),
    path: form.get("path"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { videoId, body, path } = parsed.data;

  const [video] = await db
    .select({ id: sichaVideos.id })
    .from(sichaVideos)
    .where(and(eq(sichaVideos.id, videoId), eq(sichaVideos.status, "active")))
    .limit(1);
  if (!video) return { error: "הסרטון לא נמצא" };

  await db.insert(sichaVideoIdeas).values({ videoId, teacherId: user.id, body });
  await logAudit({
    actorId: user.id,
    action: "sicha.video.idea.create",
    entityType: "sicha_video",
    entityId: videoId,
    details: { length: body.length },
  });
  revalidatePath(path);
  return { ok: true };
}

const copyrightSchema = z.object({
  videoId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, "נא להזין שם").max(120),
  email: z.string().trim().toLowerCase().email("כתובת מייל לא תקינה"),
  details: z.string().trim().min(5, "כתבי כמה מילים על מה הדיווח").max(3000, "הטקסט ארוך מדי"),
  website: z.string().max(0).optional(), // honeypot
});

/** דיווח על סרטון שפוגע בזכויות יוצרים – פתוח לכל גולשת (גם בלי הרשמה), נשלח במייל למנהלת האתר */
export async function reportVideoCopyright(
  _prev: { error?: string; ok?: string } | undefined,
  form: FormData,
): Promise<{ error?: string; ok?: string }> {
  const parsed = copyrightSchema.safeParse({
    videoId: form.get("videoId") || undefined,
    name: form.get("name"),
    email: form.get("email"),
    details: form.get("details"),
    website: form.get("website") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await tooMany(limitKey("video-copyright", "ip", await clientIp()), 5, 3600)) return { error: TOO_MANY_MESSAGE };
  const admin = adminEmail();
  if (!admin) return { error: "כתובת המנהלת לא מוגדרת" };
  const { videoId, name, email, details } = parsed.data;

  let videoLine = "";
  if (videoId) {
    const [v] = await db
      .select({ id: sichaVideos.id, title: sichaVideos.title })
      .from(sichaVideos)
      .where(eq(sichaVideos.id, videoId))
      .limit(1);
    if (v) videoLine = `סרטון מס׳ ${v.id}: ${v.title}\n\n`;
  }
  const user = await getCurrentUser();
  const r = await sendMail({
    to: admin,
    ...templates.contact(name, email, `${videoLine}${details}`, "דיווח על זכויות יוצרים בסרטון"),
    kind: "contact",
    userId: user?.id ?? null,
  });
  await logAudit({
    actorId: user?.id ?? null,
    action: "sicha.video.copyright_report",
    entityType: "sicha_video",
    entityId: videoId ?? null,
    details: { sent: r.ok },
  });
  return r.ok ? { ok: "הדיווח התקבל, תודה. נבדוק ונטפל בהקדם." } : { error: "השליחה נכשלה, נסי שוב מאוחר יותר" };
}

/** לייק "השתמשתי / נהניתי" על סרטון: לחיצה מסמנת, ועוד לחיצה מבטלת (כמו בשיעורי היהדות) */
export async function toggleVideoUsage(
  _prev: { error?: string; ok?: boolean } | undefined,
  form: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי לסמן שימוש" };
  const videoId = Number(form.get("videoId"));
  const path = String(form.get("path") ?? "");
  if (!Number.isInteger(videoId) || videoId <= 0 || !path) return { error: "בקשה לא תקינה" };

  const deleted = await db
    .delete(sichaVideoUsages)
    .where(and(eq(sichaVideoUsages.videoId, videoId), eq(sichaVideoUsages.teacherId, user.id)))
    .returning({ id: sichaVideoUsages.id });
  if (deleted.length === 0) {
    const [video] = await db.select({ id: sichaVideos.id }).from(sichaVideos).where(eq(sichaVideos.id, videoId)).limit(1);
    if (!video) return { error: "הסרטון לא נמצא" };
    await db.insert(sichaVideoUsages).values({ videoId, teacherId: user.id });
  }
  await logAudit({
    actorId: user.id,
    action: "sicha.video.usage.toggle",
    entityType: "sicha_video",
    entityId: videoId,
    details: { on: deleted.length === 0 },
  });
  revalidatePath(path);
  return { ok: true };
}
