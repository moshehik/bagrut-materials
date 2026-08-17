"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  materials,
  users,
  sellOffers,
  forumThreads,
  materialKindEnum,
  tierEnum,
  roleEnum,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";

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
const priceShekel = z.preprocess(
  emptyToUndef,
  z.coerce.number().min(0).max(100000).optional(),
);
const boolField = z.preprocess(
  (v) => v === "on" || v === "true" || v === true || v === "1",
  z.boolean(),
);

async function guard(): Promise<string | null> {
  try {
    await requireAdmin();
    return null;
  } catch {
    return "אין הרשאה";
  }
}

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/subjects", "layout");
  revalidatePath("/map");
  revalidatePath("/");
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
});

export async function createCategory(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const err = await guard();
  if (err) return { error: err };
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
      })
      .returning({ id: categories.id });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
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
  const err = await guard();
  if (err) return { error: err };
  const idParsed = z.coerce.number().int().safeParse(form.get("id"));
  if (!idParsed.success) return { error: "מזהה לא תקין" };
  const parsed = categorySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let slug = slugifySync(d.slug ?? d.title);
  if (!slug) slug = randomSlug();
  try {
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
        bundlePrice: d.bundlePrice !== undefined ? Math.round(d.bundlePrice * 100) : null,
      })
      .where(eq(categories.id, idParsed.data));
    revalidateAll();
    return { ok: true, id: idParsed.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("categories_parent_slug_idx")) {
      return { error: "כבר קיימת קטגוריה עם אותו slug תחת אותו הורה" };
    }
    return { error: "שגיאה בשמירה: " + msg };
  }
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

async function deleteBlobSafe(url: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  if (!/^https?:\/\//.test(url) || url.includes("example.com")) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(url);
  } catch {
    // מתעלמים – הקובץ אולי כבר לא קיים
  }
}

export async function deleteCategory(id: number): Promise<AdminActionState> {
  const err = await guard();
  if (err) return { error: err };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const ids = await collectDescendants(id);
  // מחיקת קבצי blob של חומרים תחת העץ
  const mats = await db
    .select({ fileUrl: materials.fileUrl })
    .from(materials)
    .where(inArray(materials.categoryId, ids));
  await Promise.all(mats.map((m) => deleteBlobSafe(m.fileUrl)));
  // materials נמחקים ב-cascade; מוחקים את הקטגוריות מהעלים אל השורש
  for (const cid of [...ids].reverse()) {
    await db.delete(categories).where(eq(categories.id, cid));
  }
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
  minTier: z.enum(tierEnum.enumValues).default("none"),
  sort: z.preprocess(emptyToUndef, z.coerce.number().int().optional()),
});

export type MaterialInput = z.input<typeof materialSchema>;

export async function createMaterial(input: MaterialInput): Promise<AdminActionState> {
  const err = await guard();
  if (err) return { error: err };
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
        minTier: d.minTier,
        sort: d.sort ?? 0,
      })
      .returning({ id: materials.id });
    revalidateAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return { error: "שגיאה בשמירה: " + (e instanceof Error ? e.message : String(e)) };
  }
}

const materialUpdateSchema = z.object({
  id: z.coerce.number().int(),
  title: z.string().trim().min(1, "נא להזין כותרת").max(200),
  description: optionalStr,
  kind: z.enum(materialKindEnum.enumValues),
  price: priceShekel,
  premiumOnly: boolField.default(false),
  minTier: z.enum(tierEnum.enumValues).default("none"),
  sort: z.preprocess(emptyToUndef, z.coerce.number().int().optional()),
});

export async function updateMaterial(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const err = await guard();
  if (err) return { error: err };
  const parsed = materialUpdateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await db
      .update(materials)
      .set({
        title: d.title,
        description: d.description ?? null,
        kind: d.kind,
        price: d.price !== undefined ? Math.round(d.price * 100) : 1500,
        premiumOnly: d.premiumOnly,
        minTier: d.minTier,
        sort: d.sort ?? 0,
      })
      .where(eq(materials.id, d.id));
    revalidateAll();
    return { ok: true, id: d.id };
  } catch (e) {
    return { error: "שגיאה בשמירה: " + (e instanceof Error ? e.message : String(e)) };
  }
}

export async function deleteMaterial(id: number): Promise<AdminActionState> {
  const err = await guard();
  if (err) return { error: err };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  const [m] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!m) return { error: "החומר לא נמצא" };
  await deleteBlobSafe(m.fileUrl);
  await db.delete(materials).where(eq(materials.id, id));
  revalidateAll();
  return { ok: true };
}

/* ---------- users ---------- */

const userSchema = z.object({
  id: z.coerce.number().int(),
  role: z.enum(roleEnum.enumValues),
  tier: z.enum(tierEnum.enumValues),
});

export async function updateUser(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const err = await guard();
  if (err) return { error: err };
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, role, tier } = parsed.data;
  const me = await requireAdmin();
  if (me.id === id && role !== "admin") {
    return { error: "לא ניתן להסיר הרשאת ניהול מעצמך" };
  }
  await db.update(users).set({ role, tier }).where(eq(users.id, id));
  revalidatePath("/admin/users");
  revalidatePath("/account");
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
  const err = await guard();
  if (err) return { error: err };
  const parsed = offerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db
    .update(sellOffers)
    .set({ status: parsed.data.status })
    .where(eq(sellOffers.id, parsed.data.id));
  revalidatePath("/admin/offers");
  return { ok: true, id: parsed.data.id };
}

/* ---------- forum ---------- */

export async function deleteThread(id: number): Promise<AdminActionState> {
  const err = await guard();
  if (err) return { error: err };
  if (!Number.isInteger(id)) return { error: "מזהה לא תקין" };
  await db.delete(forumThreads).where(eq(forumThreads.id, id));
  revalidatePath("/admin/forum");
  revalidatePath("/forum", "layout");
  return { ok: true };
}
