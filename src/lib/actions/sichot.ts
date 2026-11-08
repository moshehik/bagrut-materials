"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  sichot,
  sichaFiles,
  sichaUsages,
  sichaIdeas,
  categories,
  type SichaSeminar,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { verifyUpload } from "@/lib/upload-id";
import { logAudit } from "@/lib/audit";
import { invalidateSichaAccess } from "@/lib/sicha-access";
import { TOO_MANY_MESSAGE, limitKey, tooMany } from "@/lib/rate-limit";

export type SichaActionState = { error?: string; ok?: boolean } | undefined;

const fileSchema = z.object({
  fileUrl: z.string().regex(/^drive:\/\/[A-Za-z0-9_-]{10,100}$/, "קובץ לא תקין"),
  /** חתימת /api/sichot/upload/finish - מוכיחה שהקובץ הועלה ע"י המשתמשת הזו */
  fileSig: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1).max(120),
  size: z.coerce.number().int().min(0),
});

const sichaSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  title: z.string().trim().min(4, "כותרת קצרה מדי").max(200, "כותרת ארוכה מדי"),
  description: z.string().trim().min(10, "צריך תיאור קצר של השיחה (לפחות 10 תווים)").max(2000),
  seminarType: z.enum(["mainstream", "kiruv", "charedi_modern"]),
  /** כל הקבצים שהועלו באותה העלאה הם חלק מאותו שיעור; הראשון הוא הקובץ הראשי */
  files: z.array(fileSchema).min(1, "צריך לפחות קובץ אחד").max(10, "עד 10 קבצים בשיעור אחד"),
  /** נתיב עמוד התיקייה הנוכחית, לרענון הרשימה אחרי ההעלאה */
  path: z.string().min(1),
  /** שם בדוי להצגה במקום שם המורה; ריק/חסר = בשמה האמיתי */
  displayName: z.string().trim().min(2, "שם בדוי קצר מדי").max(40, "שם בדוי ארוך מדי").optional(),
});

export type CreateSichaFile = z.infer<typeof fileSchema>;

/**
 * נקראת ישירות מהלקוח אחרי העלאת הקבצים (בדומה ל-createMaterial), לא דרך useActionState.
 * שיחה אחת = העלאה אחת, ויכולים להיות לה כמה קבצים. אין חובת העלאה חוזרת.
 */
export async function createSicha(input: {
  categoryId: number;
  title: string;
  description: string;
  seminarType: SichaSeminar;
  files: CreateSichaFile[];
  path: string;
  displayName?: string;
}): Promise<{ ok: true; id: number } | { error: string }> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי להעלות שיחה" };

  const parsed = sichaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { categoryId, title, description, seminarType, files, path, displayName } = parsed.data;
  if (user.suspended) return { error: "החשבון מושעה" };
  if (files.some((f) => !verifyUpload(user.id, f.fileUrl, f.fileSig))) {
    return { error: "הקובץ לא הועלה מהחשבון הזה - יש להעלות אותו מחדש" };
  }

  const [cat] = await db
    .select({ contentModule: categories.contentModule })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!cat || cat.contentModule !== "sichot") return { error: "התיקייה לא נמצאה" };

  const [first, ...rest] = files;
  const [row] = await db
    .insert(sichot)
    .values({
      categoryId,
      teacherId: user.id,
      title,
      description,
      seminarType: seminarType as SichaSeminar,
      fileUrl: first.fileUrl,
      fileName: first.fileName,
      mime: first.mime,
      size: first.size,
      displayName: displayName ?? null,
    })
    .returning({ id: sichot.id });

  if (rest.length) {
    await db.insert(sichaFiles).values(
      rest.map((f, i) => ({
        sichaId: row.id,
        fileUrl: f.fileUrl,
        fileName: f.fileName,
        mime: f.mime,
        size: f.size,
        sort: i + 1,
      })),
    );
  }

  await logAudit({
    actorId: user.id,
    action: "sicha.create",
    entityType: "sicha",
    entityId: row.id,
    details: { categoryId, files: files.length, pseudonym: displayName ?? null },
  });
  invalidateSichaAccess(user.id);
  revalidatePath(path);
  return { ok: true, id: row.id };
}

const addFileSchema = z.object({
  sichaId: z.coerce.number().int().positive(),
  file: fileSchema,
  path: z.string().min(1),
});

/**
 * מורה מוסיפה קובץ חדש לשיעור קיים (הפלוס ליד "הוספת רעיון"). הקובץ כבר הועלה לדרייב דרך
 * /api/sichot/upload/*; כאן רק מצרפים אותו כשורה ב-sicha_files, באותו תקרה של 10 קבצים לשיעור.
 * מי הוסיפה נשמר ביומן הביקורת (אין עמודה ייעודית).
 */
export async function addSichaFile(input: {
  sichaId: number;
  file: CreateSichaFile;
  path: string;
}): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי להוסיף קובץ" };
  if (user.suspended) return { error: "החשבון מושעה" };
  if (await tooMany(limitKey("sicha-file", "user", user.id), 20, 3600)) return { error: TOO_MANY_MESSAGE };

  const parsed = addFileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { sichaId, file, path } = parsed.data;
  if (!verifyUpload(user.id, file.fileUrl, file.fileSig)) {
    return { error: "הקובץ לא הועלה מהחשבון הזה - יש להעלות אותו מחדש" };
  }

  const [sicha] = await db.select({ status: sichot.status }).from(sichot).where(eq(sichot.id, sichaId)).limit(1);
  if (!sicha || sicha.status !== "active") return { error: "השיעור לא נמצא" };

  const existing = await db.select({ sort: sichaFiles.sort }).from(sichaFiles).where(eq(sichaFiles.sichaId, sichaId));
  if (existing.length + 1 >= 10) return { error: "בשיעור אחד יכולים להיות עד 10 קבצים" };

  await db.insert(sichaFiles).values({
    sichaId,
    fileUrl: file.fileUrl,
    fileName: file.fileName,
    mime: file.mime,
    size: file.size,
    sort: existing.reduce((m, r) => Math.max(m, r.sort), 0) + 1,
  });
  await logAudit({
    actorId: user.id,
    action: "sicha.file.add",
    entityType: "sicha",
    entityId: sichaId,
    details: { fileName: file.fileName, size: file.size },
  });

  revalidatePath(path);
  return { ok: true };
}

const usageSchema = z.object({
  sichaId: z.coerce.number().int().positive(),
  path: z.string().min(1),
});

export async function toggleUsage(_prev: SichaActionState, form: FormData): Promise<SichaActionState> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי לסמן שימוש" };
  const parsed = usageSchema.safeParse({ sichaId: form.get("sichaId"), path: form.get("path") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { sichaId, path } = parsed.data;

  const deleted = await db
    .delete(sichaUsages)
    .where(and(eq(sichaUsages.sichaId, sichaId), eq(sichaUsages.teacherId, user.id)))
    .returning({ id: sichaUsages.id });

  if (deleted.length === 0) {
    await db.insert(sichaUsages).values({ sichaId, teacherId: user.id });
  }
  await logAudit({
    actorId: user.id,
    action: "sicha.usage.toggle",
    entityType: "sicha",
    entityId: sichaId,
    details: { on: deleted.length === 0 },
  });

  revalidatePath(path);
  return { ok: true };
}

const ideaSchema = z.object({
  sichaId: z.coerce.number().int().positive(),
  body: z.string().trim().min(3, "כתבי רעיון קצת יותר מפורט").max(2000, "הרעיון ארוך מדי"),
  path: z.string().min(1),
});

export async function addIdea(_prev: SichaActionState, form: FormData): Promise<SichaActionState> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי להוסיף רעיון" };
  // הגבלת קצב: 30 רעיונות לשעה למורה
  if (await tooMany(limitKey("sicha-idea", "user", user.id), 30, 3600)) return { error: TOO_MANY_MESSAGE };
  const parsed = ideaSchema.safeParse({
    sichaId: form.get("sichaId"),
    body: form.get("body"),
    path: form.get("path"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { sichaId, body, path } = parsed.data;

  await db.insert(sichaIdeas).values({ sichaId, teacherId: user.id, body });
  await logAudit({
    actorId: user.id,
    action: "sicha.idea.create",
    entityType: "sicha",
    entityId: sichaId,
    details: { length: body.length },
  });

  revalidatePath(path);
  return { ok: true };
}
