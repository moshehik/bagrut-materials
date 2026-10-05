"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  materials,
  users,
  sellOffers,
  forumThreads,
  forumPosts,
  forumReports,
  purchases,
  transactions,
  materialKindEnum,
  roleEnum,
  accessEnum,
  statusEnum,
  planEnum,
  txTypeEnum,
  type Category,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { driveSafe, ensureCategoryFolder, loadCategories, placeMaterial, syncCategoryFolderName, driveTrash, logDriveEvent, folderHasLiveFiles } from "@/lib/driveTree";
import { PLANS } from "@/lib/constants";
import { addDays } from "@/lib/purchase-helpers";

export type AdminActionState = { error?: string; ok?: boolean; id?: number } | undefined;

/* ---------- helpers ---------- */

import { slugify as slugifySync } from "@/lib/admin-utils";

function randomSlug() {
  return "c-" + Math.random().toString(36).slice(2, 8);
}

function emptyToUndef(v: unknown) {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

const optionalInt = z.preprocess(
  emptyToUndef,
  z.coerce.number().int().optional(),
);
const optionalStr = z.preprocess(emptyToUndef, z.string().trim().max(500).optional());
const optionalLongStr = z.preprocess(emptyToUndef, z.string().trim().max(5000).optional());
const priceShekel = z.preprocess(
  emptyToUndef,
  z.coerce.number().min(0).max(100000).optional(),
);
const boolField = z.preprocess(
  (v) => v === "on" || v === "true" || v === true || v === "1",
  z.boolean(),
);

/** מחזיר את המנהלת הנוכחית או null (ללא זריקה) */
async function admin() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/subjects", "layout");
  revalidatePath("/map");
  revalidatePath("/");
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** מזהה קובץ הדרייב מתוך drive://<id> (null לכל כתובת אחרת – לא כותבים כתובות לקובץ ליומן) */
function driveIdOf(url: string): string | null {
  return url.startsWith("drive://") ? url.slice("drive://".length).split("?")[0] : null;
}

/** חיתוך טקסט ארוך לפני כתיבה ליומן (ברירת מחדל 500 תווים) */
function clip(s: string | null | undefined, max = 500): string | null {
  if (s === null || s === undefined) return null;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/* ---------- categories ---------- */

const categorySchema = z.object({
  parentId: optionalInt,
  title: z.string().trim().min(1, "נא להזין כותרת").max(200),
  slug: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  description: optionalStr,
  questionnaireCode: z.preprocess(emptyToUndef, z.string().trim().max(32).optional()),
  icon: z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  color: z.preprocess(emptyToUndef, z.string().trim().max(20).optional()),
  sort: z.preprocess(emptyToUndef, z.coerce.number().int().optional()),
  bundlePrice: priceShekel, // בשקלים, יומר לאגורות
  status: z.enum(statusEnum.enumValues).default("active"),
});

export async function createCategory(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const parsed = categorySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let slug = slugifySync(d.slug ?? d.title);
  if (!slug) slug = randomSlug();
  const parentId = d.parentId ?? null;
  try {
    const [row] = await db
      .insert(categories)
      .values({
        parentId,
        title: d.title,
        slug,
        description: d.description ?? null,
        questionnaireCode: d.questionnaireCode ?? null,
        icon: d.icon ?? null,
        color: d.color ?? null,
        sort: d.sort ?? 0,
        bundlePrice: d.bundlePrice !== undefined ? Math.round(d.bundlePrice * 100) : null,
        status: d.status,
      })
      .returning({ id: categories.id });
    await logAudit({
      actorId: me.id,
      action: "category.create",
      entityType: "category",
      entityId: row.id,
      details: { title: d.title, parentId },
    });
    // עץ הדרייב משקף את עץ האתר: תיקייה לקטגוריה החדשה
    await driveSafe(me.id, `category.create #${row.id}`, async () =>
      ensureCategoryFolder(row.id, { ...(await loadCategories()), names: new Map(), actorId: me.id }),
    );
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    const msg = errMsg(e);
    await logAudit({
      actorId: me.id,
      action: "category.create_failed",
      entityType: "category",
      details: { title: d.title, parentId, slug, error: clip(msg) },
    });
    if (msg.includes("categories_parent_slug_idx")) {
      return { error: "כבר קיימת קטגוריה עם אותו slug תחת אותו הורה" };
    }
    return { error: "שגיאה בשמירה: " + msg };
  }
}

export async function updateCategory(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const idParsed = z.coerce.number().int().safeParse(form.get("id"));
  if (!idParsed.success) return { error: "מזהה לא תקין" };
  const parsed = categorySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let slug = slugifySync(d.slug ?? d.title);
  if (!slug) slug = randomSlug();
  try {
    // המצב הקודם – לפני/אחרי ביומן
    const [old] = await db
      .select({
        title: categories.title,
        slug: categories.slug,
        status: categories.status,
        bundlePrice: categories.bundlePrice,
        sort: categories.sort,
        description: categories.description,
      })
      .from(categories)
      .where(eq(categories.id, idParsed.data))
      .limit(1);
    const newBundlePrice = d.bundlePrice !== undefined ? Math.round(d.bundlePrice * 100) : null;
    await db
      .update(categories)
      .set({
        title: d.title,
        slug,
        description: d.description ?? null,
        questionnaireCode: d.questionnaireCode ?? null,
        icon: d.icon ?? null,
        color: d.color ?? null,
        sort: d.sort ?? 0,
        bundlePrice: newBundlePrice,
        status: d.status,
      })
      .where(eq(categories.id, idParsed.data));
    await logAudit({
      actorId: me.id,
      action: "category.update",
      entityType: "category",
      entityId: idParsed.data,
      details: {
        title: d.title,
        status: d.status,
        before: old
          ? {
              title: old.title,
              slug: old.slug,
              status: old.status,
              price: old.bundlePrice,
              sort: old.sort,
              description: clip(old.description, 200),
            }
          : null,
        after: {
          title: d.title,
          slug,
          status: d.status,
          price: newBundlePrice,
          sort: d.sort ?? 0,
          description: clip(d.description ?? null, 200),
        },
      },
    });
    // שינוי כותרת ← שינוי שם תיקיית הדרייב
    await driveSafe(me.id, `category.update #${idParsed.data}`, () => syncCategoryFolderName(idParsed.data, me.id));
    revalidateAll();
    return { ok: true, id: idParsed.data };
  } catch (e) {
    const msg = errMsg(e);
    await logAudit({
      actorId: me.id,
      action: "category.update_failed",
      entityType: "category",
      entityId: idParsed.data,
      details: { title: d.title, slug, error: clip(msg) },
    });
    if (msg.includes("categories_parent_slug_idx")) {
      return { error: "כבר קיימת קטגוריה עם אותו slug תחת אותו הורה" };
    }
    return { error: "שגיאה בשמירה: " + msg };
  }
}

/** השהיה / הפעלה של תיקייה שלמה (כל העץ תחתיה מוסתר אוטומטית) */
export async function toggleCategoryStatus(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const [c] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!c) return { error: "הקטגוריה לא נמצאה" };
  const next: Category["status"] = c.status === "active" ? "suspended" : "active";
  await db.update(categories).set({ status: next }).where(eq(categories.id, id));
  await logAudit({
    actorId: me.id,
    action: next === "suspended" ? "category.suspend" : "category.activate",
    entityType: "category",
    entityId: id,
    details: { title: c.title, from: c.status, to: next },
  });
  revalidateAll();
  return { ok: true, id };
}

async function collectDescendants(rootId: number): Promise<number[]> {
  const ids: number[] = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.parentId, frontier));
    frontier = rows.map((r) => r.id);
    ids.push(...frontier);
  }
  return ids;
}

async function deleteStoredFile(url: string, ctx: { actorId: number; materialId?: number | null }) {
  const { isDriveUrl, driveIdFromUrl, driveDelete } = await import("@/lib/driveBridge");
  if (isDriveUrl(url)) {
    const fileId = driveIdFromUrl(url);
    if (!fileId) return;
    try {
      await driveDelete(fileId);
    } catch (e) {
      // לא מפילים את המחיקה (הקובץ אולי כבר לא קיים / הגשר לא מוגדר) – אבל רושמים, כדי שאפשר יהיה לנקות ידנית
      await logAudit({
        actorId: ctx.actorId,
        action: "material.drive_delete_failed",
        entityType: "material",
        entityId: ctx.materialId ?? null,
        details: { fileId, error: clip(errMsg(e)) },
      });
    }
    return;
  }
  // כל מה שאינו drive:// (שורות Blob ישנות/seed) - אין מה למחוק, האחסון היחיד הוא הדרייב
}

export async function deleteCategory(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const ids = await collectDescendants(id);
  // כותרות הקטגוריות שיימחקו – נשמרות ליומן לפני המחיקה
  const catRows = await db
    .select({ id: categories.id, title: categories.title })
    .from(categories)
    .where(inArray(categories.id, ids));
  // תיקיית הדרייב של שורש העץ שנמחק (נשלחת לאשפה אחרי שהקבצים שבתוכה נמחקו)
  const [rootCat] = await db.select({ f: categories.driveFolderId }).from(categories).where(eq(categories.id, id));
  // מחיקת קבצי הדרייב של חומרים תחת העץ
  const mats = await db
    .select({ id: materials.id, fileUrl: materials.fileUrl })
    .from(materials)
    .where(inArray(materials.categoryId, ids));
  await Promise.all(mats.map((m) => deleteStoredFile(m.fileUrl, { actorId: me.id, materialId: m.id })));
  // materials נמחקים ב-cascade; מוחקים את הקטגוריות מהעלים אל השורש
  for (const cid of [...ids].reverse()) {
    await db.delete(categories).where(eq(categories.id, cid));
  }
  if (rootCat?.f) {
    await driveSafe(me.id, `category.delete #${id}`, async () => {
      // לא שולחים לאשפה תיקייה שעדיין יש בה קבצים חיים (למשל חומר שה-DB שלו וה-Drive שלו לא מסונכרנים) — רק מתעדים
      if (await folderHasLiveFiles(rootCat.f!)) {
        await logDriveEvent({ kind: "folder.delete_skipped", categoryId: id, driveId: rootCat.f, details: "נשארו קבצים חיים בתיקייה", actorId: me.id });
        return;
      }
      await driveTrash(rootCat.f!);
      await logDriveEvent({ kind: "folder.delete", categoryId: id, driveId: rootCat.f, details: { deletedCategories: ids.length }, actorId: me.id });
    });
  }
  await logAudit({
    actorId: me.id,
    action: "category.delete",
    entityType: "category",
    entityId: id,
    details: {
      deletedCategories: ids.length,
      deletedMaterials: mats.length,
      // עץ הקטגוריות שנמחק (מזהה + כותרת); מוגבל ל-200 כדי שהלוג לא יתנפח
      categories: catRows.slice(0, 200).map((c) => ({ id: c.id, title: c.title })),
      materialIds: mats.slice(0, 500).map((m) => m.id),
    },
  });
  revalidateAll();
  return { ok: true };
}

/* ---------- materials ---------- */

const materialSchema = z.object({
  categoryId: z.coerce.number().int(),
  title: z.string().trim().min(1, "נא להזין כותרת").max(200),
  description: optionalStr,
  kind: z.enum(materialKindEnum.enumValues),
  fileUrl: z.string().url("קישור קובץ לא תקין"),
  fileName: z.string().trim().min(1).max(255),
  mime: z.string().trim().max(120).default("application/octet-stream"),
  size: z.coerce.number().int().min(0).default(0),
  price: priceShekel, // בשקלים
  premiumOnly: boolField.default(false),
  sort: z.preprocess(emptyToUndef, z.coerce.number().int().optional()),
  access: z.enum(accessEnum.enumValues).default("paid"),
  status: z.enum(statusEnum.enumValues).default("active"),
  allowDownload: boolField.default(true),
  allowPreview: boolField.default(false),
  maxDownloadsPerUser: optionalInt,
});

export type MaterialInput = z.input<typeof materialSchema>;

export async function createMaterial(input: MaterialInput): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const parsed = materialSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    const [row] = await db
      .insert(materials)
      .values({
        categoryId: d.categoryId,
        title: d.title,
        description: d.description ?? null,
        kind: d.kind,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        mime: d.mime,
        size: d.size,
        price: d.price !== undefined ? Math.round(d.price * 100) : 1500,
        premiumOnly: d.premiumOnly,
        sort: d.sort ?? 0,
        access: d.access,
        status: d.status,
        allowDownload: d.allowDownload,
        allowPreview: d.allowPreview,
        maxDownloadsPerUser: d.maxDownloadsPerUser ?? null,
      })
      .returning({ id: materials.id });
    await logAudit({
      actorId: me.id,
      action: "material.create",
      entityType: "material",
      entityId: row.id,
      details: {
        title: d.title,
        categoryId: d.categoryId,
        access: d.access,
        status: d.status,
        fileName: d.fileName,
        size: d.size,
        kind: d.kind,
        price: d.price !== undefined ? Math.round(d.price * 100) : 1500,
        fileId: driveIdOf(d.fileUrl),
      },
    });
    // העלאה חדשה ← הקובץ עובר לתיקיית הקטגוריה שלו ומקבל את שם הקובץ באתר; ההוספה נרשמת בהיסטוריית הדרייב
    await driveSafe(me.id, `material.create #${row.id}`, async () => {
      await logDriveEvent({ kind: "file.add", materialId: row.id, categoryId: d.categoryId, driveId: driveIdOf(d.fileUrl), newValue: d.fileName, details: { via: "upload-form" }, actorId: me.id });
      await placeMaterial(row.id, { actorId: me.id });
    });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    await logAudit({
      actorId: me.id,
      action: "material.create_failed",
      entityType: "material",
      details: {
        title: d.title,
        categoryId: d.categoryId,
        fileName: d.fileName,
        size: d.size,
        kind: d.kind,
        error: clip(errMsg(e)),
      },
    });
    return { error: "שגיאה בשמירה: " + errMsg(e) };
  }
}

const materialUpdateSchema = z.object({
  id: z.coerce.number().int(),
  title: z.string().trim().min(1, "נא להזין כותרת").max(200),
  description: optionalStr,
  kind: z.enum(materialKindEnum.enumValues),
  price: priceShekel,
  premiumOnly: boolField.default(false),
  sort: z.preprocess(emptyToUndef, z.coerce.number().int().optional()),
  access: z.enum(accessEnum.enumValues).default("paid"),
  status: z.enum(statusEnum.enumValues).default("active"),
  allowDownload: boolField.default(true),
  allowPreview: boolField.default(false),
  maxDownloadsPerUser: optionalInt,
});

export async function updateMaterial(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const parsed = materialUpdateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    // המצב הקודם – לפני/אחרי ביומן
    const [old] = await db.select().from(materials).where(eq(materials.id, d.id)).limit(1);
    const newPrice = d.price !== undefined ? Math.round(d.price * 100) : 1500;
    const newMaxDl =
      d.maxDownloadsPerUser !== undefined && d.maxDownloadsPerUser > 0 ? d.maxDownloadsPerUser : null;
    await db
      .update(materials)
      .set({
        title: d.title,
        description: d.description ?? null,
        kind: d.kind,
        price: newPrice,
        premiumOnly: d.premiumOnly,
        sort: d.sort ?? 0,
        access: d.access,
        status: d.status,
        allowDownload: d.allowDownload,
        allowPreview: d.allowPreview,
        maxDownloadsPerUser: newMaxDl,
      })
      .where(eq(materials.id, d.id));
    await logAudit({
      actorId: me.id,
      action: "material.update",
      entityType: "material",
      entityId: d.id,
      details: {
        title: d.title,
        access: d.access,
        status: d.status,
        allowDownload: d.allowDownload,
        allowPreview: d.allowPreview,
        before: old
          ? {
              title: old.title,
              kind: old.kind,
              price: old.price,
              premiumOnly: old.premiumOnly,
              access: old.access,
              status: old.status,
              allowDownload: old.allowDownload,
              allowPreview: old.allowPreview,
              sort: old.sort,
              description: clip(old.description, 200),
              maxDownloadsPerUser: old.maxDownloadsPerUser,
            }
          : null,
        after: {
          title: d.title,
          kind: d.kind,
          price: newPrice,
          premiumOnly: d.premiumOnly,
          access: d.access,
          status: d.status,
          allowDownload: d.allowDownload,
          allowPreview: d.allowPreview,
          sort: d.sort ?? 0,
          description: clip(d.description ?? null, 200),
          maxDownloadsPerUser: newMaxDl,
        },
      },
    });
    revalidateAll();
    return { ok: true, id: d.id };
  } catch (e) {
    await logAudit({
      actorId: me.id,
      action: "material.update_failed",
      entityType: "material",
      entityId: d.id,
      details: { title: d.title, error: clip(errMsg(e)) },
    });
    return { error: "שגיאה בשמירה: " + errMsg(e) };
  }
}

/** השהיה / הפעלה מהירה של חומר */
export async function toggleMaterialStatus(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const [m] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!m) return { error: "החומר לא נמצא" };
  const next = m.status === "active" ? "suspended" : "active";
  await db.update(materials).set({ status: next }).where(eq(materials.id, id));
  await logAudit({
    actorId: me.id,
    action: next === "suspended" ? "material.suspend" : "material.activate",
    entityType: "material",
    entityId: id,
    details: { title: m.title, from: m.status, to: next },
  });
  revalidateAll();
  return { ok: true, id };
}

export async function deleteMaterial(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const [m] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!m) return { error: "החומר לא נמצא" };
  await deleteStoredFile(m.fileUrl, { actorId: me.id, materialId: id });
  await db.delete(materials).where(eq(materials.id, id));
  await logAudit({
    actorId: me.id,
    action: "material.delete",
    entityType: "material",
    entityId: id,
    details: { title: m.title, fileName: m.fileName },
  });
  revalidateAll();
  return { ok: true };
}

/* ---------- users ---------- */

const userSchema = z.object({
  id: z.coerce.number().int(),
  role: z.enum(roleEnum.enumValues),
  dailyDownloadLimit: optionalInt,
  notes: optionalLongStr,
});

export async function updateUser(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, role, dailyDownloadLimit, notes } = parsed.data;
  if (me.id === id && role !== "admin") {
    return { error: "לא ניתן להסיר הרשאת ניהול מעצמך" };
  }
  // המצב הקודם – לפני/אחרי ביומן (שינוי הרשאה/מכסה הוא פעולה רגישה)
  const [old] = await db
    .select({
      role: users.role,
      dailyDownloadLimit: users.dailyDownloadLimit,
      notes: users.notes,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const newLimit =
    dailyDownloadLimit !== undefined && dailyDownloadLimit >= 0 ? dailyDownloadLimit : null;
  await db
    .update(users)
    .set({
      role,
      dailyDownloadLimit: newLimit,
      notes: notes ?? null,
    })
    .where(eq(users.id, id));
  await logAudit({
    actorId: me.id,
    action: "user.update",
    entityType: "user",
    entityId: id,
    details: {
      role,
      dailyDownloadLimit: newLimit,
      before: old
        ? {
            role: old.role,
            limit: old.dailyDownloadLimit,
            notes: clip(old.notes, 200),
          }
        : null,
      after: { role, limit: newLimit, notes: clip(notes ?? null, 200) },
    },
  });
  if (old && old.role !== role) {
    await logAudit({
      actorId: me.id,
      action: "user.role_change",
      entityType: "user",
      entityId: id,
      details: { from: old.role, to: role },
    });
  }
  revalidatePath("/admin/users");
  revalidatePath("/account");
  return { ok: true, id };
}

const suspendSchema = z.object({
  id: z.coerce.number().int(),
  reason: optionalStr,
});

/** השהיית משתמשת (עם סיבה) */
export async function suspendUser(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const parsed = suspendSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, reason } = parsed.data;
  if (me.id === id) return { error: "לא ניתן להשהות את עצמך" };
  await db
    .update(users)
    // session_version+1 – ההשהיה מנתקת מיד כל סשן פתוח (getCurrentUser בודק גם suspended)
    .set({ suspended: true, suspendReason: reason ?? null, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, id));
  await logAudit({
    actorId: me.id,
    action: "user.suspend",
    entityType: "user",
    entityId: id,
    details: { reason: reason ?? null },
  });
  revalidatePath("/admin/users");
  return { ok: true, id };
}

/** ביטול השהיית משתמשת */
export async function unsuspendUser(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  await db
    .update(users)
    .set({ suspended: false, suspendReason: null })
    .where(eq(users.id, id));
  await logAudit({ actorId: me.id, action: "user.unsuspend", entityType: "user", entityId: id });
  revalidatePath("/admin/users");
  return { ok: true, id };
}

/* ---------- sell offers ---------- */

const offerSchema = z.object({
  id: z.coerce.number().int(),
  status: z.enum(["pending", "accepted", "rejected"]),
});

export async function updateSellOffer(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const parsed = offerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [prevOffer] = await db
    .select({ status: sellOffers.status, title: sellOffers.title })
    .from(sellOffers)
    .where(eq(sellOffers.id, parsed.data.id))
    .limit(1);
  await db
    .update(sellOffers)
    .set({ status: parsed.data.status })
    .where(eq(sellOffers.id, parsed.data.id));
  await logAudit({
    actorId: me.id,
    action: "sell_offer.update",
    entityType: "sell_offer",
    entityId: parsed.data.id,
    details: {
      title: prevOffer?.title ?? null,
      from: prevOffer?.status ?? null,
      to: parsed.data.status,
      status: parsed.data.status,
    },
  });
  revalidatePath("/admin/offers");
  return { ok: true, id: parsed.data.id };
}

/* ---------- forum ---------- */

export async function deleteThread(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  // שומרים כותרת וכותבת לפני המחיקה, כדי שאפשר יהיה לדעת בדיעבד מה נמחק
  const [t] = await db
    .select({ title: forumThreads.title, authorId: forumThreads.userId })
    .from(forumThreads)
    .where(eq(forumThreads.id, id))
    .limit(1);
  await db.delete(forumThreads).where(eq(forumThreads.id, id));
  await logAudit({
    actorId: me.id,
    action: "forum.thread.delete",
    entityType: "forum_thread",
    entityId: id,
    details: { title: t?.title ?? null, authorId: t?.authorId ?? null },
  });
  revalidatePath("/admin/forum");
  revalidatePath("/forum", "layout");
  revalidatePath("/subjects", "layout");
  return { ok: true };
}

/** מחיקת תשובה בפורום (מהמנהלת, גם של אחרות) */
export async function deleteForumPost(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const [p] = await db
    .select({ authorId: forumPosts.userId, threadId: forumPosts.threadId })
    .from(forumPosts)
    .where(eq(forumPosts.id, id))
    .limit(1);
  await db.delete(forumPosts).where(eq(forumPosts.id, id));
  await logAudit({
    actorId: me.id,
    action: "forum.post.delete",
    entityType: "forum_post",
    entityId: id,
    details: { byAdmin: true, authorId: p?.authorId ?? null, threadId: p?.threadId ?? null },
  });
  revalidatePath("/admin/forum");
  revalidatePath("/subjects", "layout");
  return { ok: true };
}

/** סגירת דיווח בפורום (התוכן נבדק ונמצא תקין, או שכבר נמחק) */
export async function closeForumReport(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  await db.update(forumReports).set({ status: "handled" }).where(eq(forumReports.id, id));
  await logAudit({ actorId: me.id, action: "forum.report.close", entityType: "forum_report", entityId: id });
  revalidatePath("/admin/forum");
  return { ok: true };
}

/* ---------- subscriptions (purchases) ---------- */

function revalidateSubs() {
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/users");
  revalidatePath("/account");
  revalidatePath("/subjects", "layout");
}

async function getPurchase(id: number) {
  const [p] = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
  return p ?? null;
}

/** הארכת מנוי ב-X ימים (מהיום, או מתאריך הסיום אם עדיין בתוקף) */
export async function extendPurchase(id: number, days: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id) || !Number.isInteger(days) || days === 0 || Math.abs(days) > 3650) {
    return { error: "מספר ימים לא תקין" };
  }
  const p = await getPurchase(id);
  if (!p) return { error: "המנוי לא נמצא" };
  const now = new Date();
  const base = p.endsAt && p.endsAt > now ? p.endsAt : now;
  const endsAt = addDays(days, base);
  await db
    .update(purchases)
    .set({ endsAt, status: p.status === "expired" ? "active" : p.status })
    .where(eq(purchases.id, id));
  await logAudit({
    actorId: me.id,
    action: "purchase.extend",
    entityType: "purchase",
    entityId: id,
    details: { days, from: p.endsAt, to: endsAt },
  });
  revalidateSubs();
  return { ok: true, id };
}

/** קביעת מכסת הורדות (null = ללא הגבלה) */
export async function setPurchaseDownloadsLimit(
  id: number,
  limit: number | null,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  if (limit !== null && (!Number.isInteger(limit) || limit < 0)) return { error: "מכסה לא תקינה" };
  const p = await getPurchase(id);
  if (!p) return { error: "המנוי לא נמצא" };
  await db.update(purchases).set({ downloadsLimit: limit }).where(eq(purchases.id, id));
  await logAudit({
    actorId: me.id,
    action: "purchase.limit",
    entityType: "purchase",
    entityId: id,
    details: { from: p.downloadsLimit, to: limit },
  });
  revalidateSubs();
  return { ok: true, id };
}

/** ביטול מנוי (ללא זיכוי) */
export async function cancelPurchase(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const p = await getPurchase(id);
  if (!p) return { error: "המנוי לא נמצא" };
  await db.update(purchases).set({ status: "cancelled" }).where(eq(purchases.id, id));
  await logAudit({
    actorId: me.id,
    action: "purchase.cancel",
    entityType: "purchase",
    entityId: id,
    details: { userId: p.userId, plan: p.plan, amount: p.amount },
  });
  revalidateSubs();
  return { ok: true, id };
}

/** זיכוי – מסמן refunded ויוצר תנועת זיכוי (סכום שלילי) */
export async function refundPurchase(
  id: number,
  note?: string,
  amountAgorot?: number,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const p = await getPurchase(id);
  if (!p) return { error: "המנוי לא נמצא" };
  if (p.status === "refunded") return { error: "המנוי כבר זוכה" };
  const amount =
    amountAgorot !== undefined && Number.isInteger(amountAgorot) && amountAgorot >= 0
      ? amountAgorot
      : p.amount;
  await db.update(purchases).set({ status: "refunded" }).where(eq(purchases.id, id));
  await db.insert(transactions).values({
    userId: p.userId,
    purchaseId: p.id,
    type: "refund",
    amount: -Math.abs(amount),
    method: "manual",
    reference: p.paymentRef ?? null,
    note: note?.trim() || "זיכוי מנוי",
    createdById: me.id,
  });
  await logAudit({
    actorId: me.id,
    action: "purchase.refund",
    entityType: "purchase",
    entityId: id,
    details: { userId: p.userId, amount, note: note ?? null },
  });
  revalidateSubs();
  return { ok: true, id };
}

/** הפעלה/כיבוי פרימיום על מנוי */
export async function togglePurchasePremium(id: number): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const p = await getPurchase(id);
  if (!p) return { error: "המנוי לא נמצא" };
  await db.update(purchases).set({ premium: !p.premium }).where(eq(purchases.id, id));
  await logAudit({
    actorId: me.id,
    action: "purchase.premium",
    entityType: "purchase",
    entityId: id,
    details: { premium: !p.premium },
  });
  revalidateSubs();
  return { ok: true, id };
}

/** עדכון הערות למנוי */
export async function updatePurchaseNotes(id: number, notes: string): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const clean = notes.trim().slice(0, 5000);
  const old = await getPurchase(id);
  await db.update(purchases).set({ notes: clean || null }).where(eq(purchases.id, id));
  await logAudit({
    actorId: me.id,
    action: "purchase.notes",
    entityType: "purchase",
    entityId: id,
    details: { before: clip(old?.notes, 200), after: clip(clean || null, 200) },
  });
  revalidateSubs();
  return { ok: true, id };
}

const manualPurchaseSchema = z.object({
  email: z.string().trim().toLowerCase().email("כתובת מייל לא תקינה"),
  plan: z.enum(planEnum.enumValues),
  categoryId: optionalInt,
  materialId: optionalInt,
  days: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).max(3650).optional()),
  downloadsLimit: optionalInt,
  premium: boolField.default(false),
  amount: priceShekel, // בשקלים
  note: optionalLongStr,
});

/** הוספת מנוי ידני (למשל תשלום בהעברה/מזומן) */
export async function createManualPurchase(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const parsed = manualPurchaseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const [u] = await db.select().from(users).where(eq(users.email, d.email)).limit(1);
  if (!u) return { error: "לא נמצאה משתמשת עם המייל הזה" };

  const def = PLANS[d.plan];
  let categoryId: number | null = null;
  let materialId: number | null = null;

  if (d.plan === "subject_monthly" || d.plan === "custom_monthly") {
    if (!d.categoryId) return { error: "יש לבחור מקצוע" };
    const [c] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, d.categoryId), isNull(categories.parentId)))
      .limit(1);
    if (!c) return { error: "יש לבחור מקצוע ראשי" };
    categoryId = c.id;
  } else if (d.plan === "bundle") {
    if (!d.categoryId) return { error: "יש לבחור תיקייה" };
    const [c] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, d.categoryId))
      .limit(1);
    if (!c) return { error: "התיקייה לא נמצאה" };
    categoryId = c.id;
  } else if (d.plan === "single") {
    if (!d.materialId) return { error: "יש להזין מזהה חומר" };
    const [m] = await db
      .select({ id: materials.id, categoryId: materials.categoryId })
      .from(materials)
      .where(eq(materials.id, d.materialId))
      .limit(1);
    if (!m) return { error: "החומר לא נמצא" };
    materialId = m.id;
    categoryId = m.categoryId;
  }

  const days = d.days !== undefined ? d.days : (def.days ?? 0);
  const endsAt = days > 0 ? addDays(days) : null;
  const downloadsLimit =
    d.downloadsLimit !== undefined && d.downloadsLimit >= 0
      ? d.downloadsLimit
      : (def.downloadsLimit ?? null);
  const amount = d.amount !== undefined ? Math.round(d.amount * 100) : 0;
  const paymentRef = `MANUAL-${Date.now()}`;

  try {
    const [row] = await db
      .insert(purchases)
      .values({
        userId: u.id,
        plan: d.plan,
        materialId,
        categoryId,
        amount,
        downloadsLimit,
        endsAt,
        premium: d.premium,
        paymentRef,
        status: "active",
        notes: d.note ?? null,
      })
      .returning({ id: purchases.id });
    await db.insert(transactions).values({
      userId: u.id,
      purchaseId: row.id,
      type: "manual",
      amount,
      method: "manual",
      reference: paymentRef,
      note: d.note ?? `מנוי ידני – ${def.label}`,
      createdById: me.id,
    });
    await logAudit({
      actorId: me.id,
      action: "purchase.manual",
      entityType: "purchase",
      entityId: row.id,
      details: { userId: u.id, plan: d.plan, amount, days, premium: d.premium, paymentRef },
    });
    revalidateSubs();
    return { ok: true, id: row.id };
  } catch (e) {
    await logAudit({
      actorId: me.id,
      action: "purchase.manual_failed",
      entityType: "purchase",
      details: { userId: u.id, plan: d.plan, amount, days, premium: d.premium, paymentRef, error: clip(errMsg(e)) },
    });
    return { error: "שגיאה בשמירה: " + errMsg(e) };
  }
}

/* ---------- finance ---------- */

const txSchema = z.object({
  email: z.preprocess(emptyToUndef, z.string().trim().toLowerCase().email("כתובת מייל לא תקינה").optional()),
  type: z.enum(txTypeEnum.enumValues),
  amount: z.coerce.number().min(-1000000).max(1000000),
  method: optionalStr,
  reference: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  note: optionalLongStr,
  purchaseId: optionalInt,
});

/** רישום תנועה כספית ידנית */
export async function createTransaction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const parsed = txSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let userId: number | null = null;
  if (d.email) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email)).limit(1);
    if (!u) return { error: "לא נמצאה משתמשת עם המייל הזה" };
    userId = u.id;
  }
  let amount = Math.round(d.amount * 100);
  if (d.type === "refund") amount = -Math.abs(amount);
  if (amount === 0) return { error: "יש להזין סכום" };
  try {
    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        purchaseId: d.purchaseId ?? null,
        type: d.type,
        amount,
        method: d.method ?? "manual",
        reference: d.reference ?? null,
        note: d.note ?? null,
        createdById: me.id,
      })
      .returning({ id: transactions.id });
    await logAudit({
      actorId: me.id,
      action: "transaction.create",
      entityType: "transaction",
      entityId: row.id,
      details: { userId, type: d.type, amount, method: d.method ?? "manual" },
    });
    revalidatePath("/admin/finance");
    return { ok: true, id: row.id };
  } catch (e) {
    await logAudit({
      actorId: me.id,
      action: "transaction.create_failed",
      entityType: "transaction",
      details: { userId, type: d.type, amount, error: clip(errMsg(e)) },
    });
    return { error: "שגיאה בשמירה: " + errMsg(e) };
  }
}
