"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  sichot,
  sichaRatings,
  sichaUsages,
  sichaIdeas,
  sichaTeacherStatus,
  categories,
  type SichaSeminar,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import {
  SICHA_REGULAR_CADENCE_WEEKS,
  SICHA_HIGH_RATED_CADENCE_WEEKS,
  SICHA_HIGH_RATED_MIN_AVG,
  SICHA_HIGH_RATED_MIN_COUNT,
} from "@/lib/constants";

export type SichaActionState = { error?: string; ok?: boolean } | undefined;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** קצב ההעלאה הבא של מורה: 10 שבועות אם היא "מדורגת גבוה" (ר' SICHA_HIGH_RATED_*), אחרת 6 */
async function nextCadenceWeeks(teacherId: number): Promise<number> {
  const [row] = await db
    .select({
      avgStars: sql<string | null>`avg(${sichaRatings.stars})`,
      n: sql<number>`count(*)::int`,
    })
    .from(sichaRatings)
    .innerJoin(sichot, eq(sichot.id, sichaRatings.sichaId))
    .where(eq(sichot.teacherId, teacherId));

  const highRated =
    !!row && row.n >= SICHA_HIGH_RATED_MIN_COUNT && Number(row.avgStars) >= SICHA_HIGH_RATED_MIN_AVG;
  return highRated ? SICHA_HIGH_RATED_CADENCE_WEEKS : SICHA_REGULAR_CADENCE_WEEKS;
}

/**
 * מאפסת/יוצרת את שעון-ההתחייבות של המורה עם כל העלאה. `count` = כמה שיחות הועלו יחד
 * בבת אחת — קצב ההתחייבות הבסיסי (6 או 10 שבועות, לפי דירוג) מוכפל בו, כלומר מורה
 * שמעלה 2 שיחות בבת אחת מקבלת פטור כפול (למשל 12 שבועות במקום 6). מחזירה את מספר
 * השבועות שניתנו בפועל, לתצוגה למורה.
 */
async function bumpTeacherStatus(teacherId: number, count: number): Promise<number> {
  const baseWeeks = await nextCadenceWeeks(teacherId);
  const weeks = baseWeeks * count;
  const now = new Date();
  const nextDueAt = new Date(now.getTime() + weeks * WEEK_MS);
  await db
    .insert(sichaTeacherStatus)
    .values({ teacherId, lastUploadAt: now, nextDueAt })
    .onConflictDoUpdate({
      target: sichaTeacherStatus.teacherId,
      set: { lastUploadAt: now, nextDueAt, reminderSentAt: null, blocked: false },
    });
  await logAudit({
    actorId: teacherId,
    action: "sicha.teacher_status",
    entityType: "user",
    entityId: teacherId,
    details: { weeks, count, nextDueAt: nextDueAt.toISOString(), unblocked: true },
  });
  return weeks;
}

const itemSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  title: z.string().trim().min(4, "כותרת קצרה מדי").max(200, "כותרת ארוכה מדי"),
  description: z.string().trim().max(2000).optional(),
  seminarType: z.enum(["mainstream", "kiruv", "charedi_modern"]),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1).max(120),
  size: z.coerce.number().int().min(0),
});

const batchSchema = z.object({
  items: z.array(itemSchema).min(1, "צריך לפחות שיחה אחת").max(20, "עד 20 שיחות בבת אחת"),
  /** נתיב עמוד התיקייה הנוכחית, לרענון הרשימה אחרי ההעלאה */
  path: z.string().min(1),
});

export type CreateSichaItem = z.infer<typeof itemSchema>;

/**
 * נקראת ישירות מהלקוח אחרי העלאת הקובץ/ים (בדומה ל-createMaterial), לא דרך
 * useActionState. תומכת בהעלאת כמה שיחות בבת אחת — ר' bumpTeacherStatus.
 */
export async function createSichaBatch(input: {
  items: CreateSichaItem[];
  path: string;
}): Promise<{ ok: true; ids: number[]; cadenceWeeks: number } | { error: string }> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי להעלות שיחה" };

  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { items, path } = parsed.data;

  const categoryIds = [...new Set(items.map((i) => i.categoryId))];
  const cats = await db
    .select({ id: categories.id, contentModule: categories.contentModule })
    .from(categories)
    .where(inArray(categories.id, categoryIds));
  if (cats.length !== categoryIds.length || cats.some((c) => c.contentModule !== "sichot")) {
    return { error: "התיקייה לא נמצאה" };
  }

  const rows = await db
    .insert(sichot)
    .values(
      items.map((d) => ({
        categoryId: d.categoryId,
        teacherId: user.id,
        title: d.title,
        description: d.description || null,
        seminarType: d.seminarType as SichaSeminar,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        mime: d.mime,
        size: d.size,
      })),
    )
    .returning({ id: sichot.id });

  const cadenceWeeks = await bumpTeacherStatus(user.id, items.length);
  await logAudit({
    actorId: user.id,
    action: "sicha.create",
    entityType: "sicha",
    entityId: rows[0]?.id ?? null,
    details: { ids: rows.map((r) => r.id), count: rows.length, categoryIds, cadenceWeeks },
  });
  revalidatePath(path);
  return { ok: true, ids: rows.map((r) => r.id), cadenceWeeks };
}

const rateSchema = z.object({
  sichaId: z.coerce.number().int().positive(),
  stars: z.coerce.number().int().min(1).max(5),
  path: z.string().min(1),
});

export async function rateSicha(_prev: SichaActionState, form: FormData): Promise<SichaActionState> {
  const user = await requireUser().catch(() => null);
  if (!user) return { error: "יש להתחבר כדי לדרג" };
  const parsed = rateSchema.safeParse({
    sichaId: form.get("sichaId"),
    stars: form.get("stars"),
    path: form.get("path"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { sichaId, stars, path } = parsed.data;

  await db
    .insert(sichaRatings)
    .values({ sichaId, teacherId: user.id, stars })
    .onConflictDoUpdate({
      target: [sichaRatings.sichaId, sichaRatings.teacherId],
      set: { stars, updatedAt: new Date() },
    });

  await logAudit({
    actorId: user.id,
    action: "sicha.rate",
    entityType: "sicha",
    entityId: sichaId,
    details: { stars },
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
