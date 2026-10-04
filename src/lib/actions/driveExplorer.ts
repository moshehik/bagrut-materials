"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, driveEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { detectKind, slugify, stripExtension } from "@/lib/admin-utils";
import { driveIdFromUrl } from "@/lib/driveBridgeCore";
import {
  ARCHIVE_SUB,
  FOLDER_MIME,
  INFO_FILE_NAME,
  coreTypeOf,
  type ArchiveKind,
  archiveDriveFile,
  categoryPathNames,
  driveGet,
  driveListFolder,
  driveUpsertTextFile,
  ensureArchiveFolders,
  ensureCategoryFolder,
  loadCategories,
  logDriveEvent,
  mapPool,
  placeMaterial,
  syncCategoryFolderName,
  syncCategoryFolderParent,
} from "@/lib/driveTreeCore";
import { loadInfoSnapshot, packageStatus, renderFolderInfo } from "@/lib/driveFolderInfo";

/**
 * פעולות סייר קבצי הדרייב (/admin/drive). כולן אדמין-בלבד (requireAdmin), כל שינוי נרשם ב-audit_logs
 * וגם בהיסטוריית הדרייב (drive_events). אף פעולה לא מוחקת קבוע — מחיקה = ארכיון / אשפת דרייב.
 * הערה: העברת קטגוריה משנה parentId ב-DB; scripts/seed.ts עושה upsert לפי (parent, slug) ולכן הרצה חוזרת שלו
 * עלולה ליצור שוב את הקטגוריה במקומה המקורי — לעדכן גם את scripts/curriculum-tree.ts אחרי העברות קבועות.
 */

export type ActionResult = { ok: boolean; error?: string; moved?: number; failed?: { id: number | string; error: string }[]; id?: number };

function done(paths = true) {
  if (paths) {
    revalidatePath("/admin/drive");
    revalidatePath("/admin/categories");
    revalidatePath("/admin/materials");
  }
}

/* ------------------------------ קריאה ------------------------------ */

export type TreeNode = {
  id: number;
  parentId: number | null;
  title: string;
  own: number;
  total: number;
  missing: number;
  excluded: boolean;
  hasFolder: boolean;
  driveFolderId: string | null;
  sort: number;
  status: string;
};

/** כל עץ הקטגוריות (קל) לסרגל הצד של הסייר. */
export async function getExplorerTree(): Promise<TreeNode[]> {
  await requireAdmin();
  const snap = await loadInfoSnapshot({ events: 0 });
  const total = new Map<number, number>();
  const missing = new Map<number, number>();
  const calc = (id: number): { files: number; miss: number } => {
    const own = snap.matsByCat.get(id)?.length ?? 0;
    const st = packageStatus(snap, id);
    let files = own;
    let miss = st && st.missing.length && !snap.byId.get(id)!.excluded ? 1 : 0;
    for (const c of snap.children.get(id) ?? []) {
      const r = calc(c.id);
      files += r.files;
      miss += r.miss;
    }
    total.set(id, files);
    missing.set(id, miss);
    return { files, miss };
  };
  for (const r of snap.children.get(null) ?? []) calc(r.id);
  return [...snap.cats].sort((a, b) => a.sort - b.sort || a.id - b.id).map((c) => ({
    id: c.id,
    parentId: c.parentId,
    title: c.title,
    own: snap.matsByCat.get(c.id)?.length ?? 0,
    total: total.get(c.id) ?? 0,
    missing: missing.get(c.id) ?? 0,
    excluded: c.excluded,
    hasFolder: !!c.driveFolderId,
    driveFolderId: c.driveFolderId ?? null,
    sort: c.sort,
    status: c.status,
  }));
}

export type ExplorerFile = {
  id: number;
  title: string;
  fileName: string;
  kind: string;
  coreType: string | null;
  status: string;
  size: number;
  createdAt: string;
  driveId: string | null;
  originalName: string | null;
  driveName: string | null;
  driveModified: string | null;
  webViewLink: string | null;
  inDrive: boolean;
};

export type UnlinkedItem = { id: string; name: string; size: number | null; modified: string | null; webViewLink: string | null };

export type FolderView = {
  categoryId: number | null;
  title: string;
  path: { id: number; title: string }[];
  folders: TreeNode[];
  files: ExplorerFile[];
  unlinked: UnlinkedItem[];
  missing: { present: string[]; missing: string[] } | null;
  driveFolderId: string | null;
  info: { fileId: string | null; modified: string | null; text: string };
};

export async function getFolderView(categoryId: number | null): Promise<FolderView> {
  await requireAdmin();
  const snap = await loadInfoSnapshot({ events: 4000 });
  const cat = categoryId ? snap.byId.get(categoryId) : null;
  if (categoryId && !cat) throw new Error("הקטגוריה לא נמצאה");

  const tree = await getExplorerTree();
  const folders = tree.filter((n) => n.parentId === categoryId).sort((a, b) => (snap.byId.get(a.id)!.sort - snap.byId.get(b.id)!.sort) || a.id - b.id);

  let live = new Map<string, Awaited<ReturnType<typeof driveListFolder>>[number]>();
  let infoFile: { id: string; modifiedTime: string | null } | null = null;
  const unlinked: UnlinkedItem[] = [];
  const mats = cat ? snap.matsByCat.get(cat.id) ?? [] : [];
  if (cat?.driveFolderId) {
    const items = await driveListFolder(cat.driveFolderId);
    live = new Map(items.map((i) => [i.id, i]));
    const linkedIds = new Set(mats.map((m) => driveIdFromUrl(m.fileUrl)).filter(Boolean) as string[]);
    for (const i of items) {
      if (i.mimeType === FOLDER_MIME) continue;
      if (i.name === INFO_FILE_NAME && i.appProperties.siteInfo === "1") {
        infoFile = { id: i.id, modifiedTime: i.modifiedTime };
        continue;
      }
      if (!linkedIds.has(i.id)) unlinked.push({ id: i.id, name: i.name, size: i.size, modified: i.modifiedTime, webViewLink: i.webViewLink });
    }
  }
  const files: ExplorerFile[] = mats.map((m) => {
    const fid = driveIdFromUrl(m.fileUrl);
    const d = fid ? live.get(fid) : undefined;
    return {
      id: m.id,
      title: m.title,
      fileName: m.fileName,
      kind: m.kind,
      coreType: coreTypeOf(m.fileName),
      status: m.status,
      size: m.size,
      createdAt: m.createdAt.toISOString(),
      driveId: fid,
      originalName: m.driveOriginalName,
      driveName: d?.name ?? null,
      driveModified: d?.modifiedTime ?? null,
      webViewLink: d?.webViewLink ?? null,
      inDrive: !!d,
    };
  });
  const st = cat ? packageStatus(snap, cat.id) : null;
  return {
    categoryId,
    title: cat ? cat.title : "כל הארכיון",
    path: cat ? categoryPathNames(cat.id, snap.byId).map((t, i, arr) => {
      // מזהי האבות לפי הנתיב
      let cur: typeof cat | undefined = cat;
      for (let k = 0; k < arr.length - 1 - i; k++) cur = cur?.parentId ? snap.byId.get(cur.parentId) : undefined;
      return { id: cur?.id ?? 0, title: t };
    }) : [],
    folders,
    files,
    unlinked,
    missing: st ? { present: [...st.present], missing: st.missing.map((t) => t.label) } : null,
    driveFolderId: cat?.driveFolderId ?? null,
    info: { fileId: infoFile?.id ?? null, modified: infoFile?.modifiedTime ?? null, text: renderFolderInfo(snap, categoryId) },
  };
}

export type ArchiveItem = {
  id: string;
  name: string;
  sub: ArchiveKind;
  subLabel: string;
  size: number | null;
  modified: string | null;
  reason: string;
  materialId: number | null;
  webViewLink: string | null;
};

export async function getArchiveView(): Promise<ArchiveItem[]> {
  await requireAdmin();
  const archive = await ensureArchiveFolders();
  const out: ArchiveItem[] = [];
  for (const k of Object.keys(ARCHIVE_SUB) as ArchiveKind[]) {
    for (const i of await driveListFolder(archive.sub[k])) {
      if (i.appProperties.siteInfo === "1") continue;
      out.push({
        id: i.id,
        name: i.name,
        sub: k,
        subLabel: ARCHIVE_SUB[k],
        size: i.size,
        modified: i.modifiedTime,
        reason: i.description?.split("\n").find((l) => l.startsWith("הועבר לארכיון:"))?.replace("הועבר לארכיון: ", "") ?? "",
        materialId: i.appProperties.materialId ? Number(i.appProperties.materialId) : null,
        webViewLink: i.webViewLink,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export type HistoryEntry = { at: string; kind: string; oldValue: string | null; newValue: string | null; details: string | null };

export async function getHistory(target: { materialId?: number; categoryId?: number }): Promise<{ originalName: string | null; entries: HistoryEntry[] }> {
  await requireAdmin();
  const cond = target.materialId ? eq(driveEvents.materialId, target.materialId) : target.categoryId ? eq(driveEvents.categoryId, target.categoryId) : undefined;
  if (!cond) return { originalName: null, entries: [] };
  const rows = await db.select().from(driveEvents).where(cond).orderBy(desc(driveEvents.createdAt)).limit(200);
  let originalName: string | null = null;
  if (target.materialId) {
    const [m] = await db.select({ o: materials.driveOriginalName }).from(materials).where(eq(materials.id, target.materialId));
    originalName = m?.o ?? null;
  }
  return { originalName, entries: rows.map((r) => ({ at: r.createdAt.toISOString(), kind: r.kind, oldValue: r.oldValue, newValue: r.newValue, details: r.details })) };
}

/* ------------------------------ כתיבה ------------------------------ */

export async function moveMaterialsAction(ids: number[], targetCategoryId: number): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!ids.length) return { ok: false, error: "לא נבחרו קבצים" };
  const [target] = await db.select().from(categories).where(eq(categories.id, targetCategoryId));
  if (!target) return { ok: false, error: "תיקיית היעד לא נמצאה" };
  const rows = await db.select({ id: materials.id, categoryId: materials.categoryId }).from(materials).where(inArray(materials.id, ids));
  await db.update(materials).set({ categoryId: targetCategoryId }).where(inArray(materials.id, ids));
  const { byId, all } = await loadCategories();
  const ctx = { byId, names: new Map<number, string>(), verified: new Set<number>(), actorId: me.id };
  void all;
  const { errors } = await mapPool(rows, 4, (r) => placeMaterial(r.id, { actorId: me.id, ctx }));
  await logAudit({ actorId: me.id, action: "material.move", entityType: "category", entityId: targetCategoryId, details: { ids, from: [...new Set(rows.map((r) => r.categoryId))], to: targetCategoryId, driveErrors: errors.length } });
  done();
  return { ok: true, moved: rows.length - errors.length, failed: errors.map((e) => ({ id: e.item.id, error: e.error })) };
}

export async function moveCategoriesAction(ids: number[], targetParentId: number | null): Promise<ActionResult> {
  const me = await requireAdmin();
  const { byId } = await loadCategories();
  if (targetParentId !== null && !byId.has(targetParentId)) return { ok: false, error: "תיקיית היעד לא נמצאה" };
  if (!ids.length) return { ok: false, error: "לא נבחרו תיקיות" };
  const isDescendant = (anc: number, node: number | null): boolean => {
    let cur = node ? byId.get(node) : undefined;
    let guard = 0;
    while (cur && guard++ < 40) {
      if (cur.id === anc) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  };
  const failed: { id: number; error: string }[] = [];
  let moved = 0;
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) { failed.push({ id, error: "לא נמצאה" }); continue; }
    if (isDescendant(id, targetParentId)) { failed.push({ id, error: "אי אפשר להעביר תיקייה אל תוך עצמה או אל תת-תיקייה שלה" }); continue; }
    const clash = [...byId.values()].find((x) => x.id !== id && x.parentId === targetParentId && x.slug === c.slug);
    if (clash) { failed.push({ id, error: `ביעד כבר קיימת תיקייה עם אותו מזהה (${c.slug})` }); continue; }
    const before = c.parentId;
    await db.update(categories).set({ parentId: targetParentId }).where(eq(categories.id, id));
    c.parentId = targetParentId;
    try {
      await syncCategoryFolderParent(id, me.id);
    } catch (e) {
      failed.push({ id, error: `ה-DB עודכן אבל תיקיית הדרייב לא הועברה: ${e instanceof Error ? e.message : e}` });
    }
    await logAudit({ actorId: me.id, action: "category.move", entityType: "category", entityId: id, details: { from: before, to: targetParentId } });
    moved++;
  }
  done();
  return { ok: failed.length === 0, moved, failed };
}

export async function renameMaterialAction(id: number, fileName: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const name = String(fileName ?? "").trim().slice(0, 255);
  if (!name) return { ok: false, error: "שם ריק" };
  const [m] = await db.select().from(materials).where(eq(materials.id, id));
  if (!m) return { ok: false, error: "החומר לא נמצא" };
  if (m.fileName === name) return { ok: true };
  await db.update(materials).set({ fileName: name }).where(eq(materials.id, id));
  let driveError: string | undefined;
  try {
    await placeMaterial(id, { actorId: me.id });
  } catch (e) {
    driveError = e instanceof Error ? e.message : String(e);
  }
  await logAudit({ actorId: me.id, action: "material.rename", entityType: "material", entityId: id, details: { from: m.fileName, to: name, driveError } });
  done();
  return driveError ? { ok: false, error: `השם עודכן באתר אבל לא בדרייב: ${driveError}` } : { ok: true };
}

export async function renameCategoryAction(id: number, title: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = String(title ?? "").trim().slice(0, 200);
  if (!t) return { ok: false, error: "שם ריק" };
  const [c] = await db.select().from(categories).where(eq(categories.id, id));
  if (!c) return { ok: false, error: "התיקייה לא נמצאה" };
  await db.update(categories).set({ title: t }).where(eq(categories.id, id));
  let driveError: string | undefined;
  try {
    await syncCategoryFolderName(id, me.id);
  } catch (e) {
    driveError = e instanceof Error ? e.message : String(e);
  }
  await logAudit({ actorId: me.id, action: "category.rename", entityType: "category", entityId: id, details: { from: c.title, to: t, driveError } });
  done();
  return driveError ? { ok: false, error: `השם עודכן באתר אבל לא בדרייב: ${driveError}` } : { ok: true };
}

export async function createFolderAction(parentId: number | null, title: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = String(title ?? "").trim().slice(0, 200);
  if (!t) return { ok: false, error: "שם ריק" };
  const { byId } = await loadCategories();
  if (parentId && !byId.has(parentId)) return { ok: false, error: "תיקיית האב לא נמצאה" };
  const siblings = [...byId.values()].filter((c) => c.parentId === parentId);
  const base = slugify(t) || "c-" + Math.random().toString(36).slice(2, 8);
  let slug = base;
  for (let n = 2; siblings.some((s) => s.slug === slug); n++) slug = `${base}-${n}`;
  // טיוטה: תיקייה חדשה מוסתרת מהמשתמשות עד שתופעל (כמו שאר הקטגוריות המושהות)
  const [row] = await db
    .insert(categories)
    .values({ parentId, title: t, slug, sort: siblings.length + 1, status: "draft" })
    .returning({ id: categories.id });
  let driveError: string | undefined;
  try {
    await ensureCategoryFolder(row.id, { ...(await loadCategories()), names: new Map(), actorId: me.id });
  } catch (e) {
    driveError = e instanceof Error ? e.message : String(e);
  }
  await logAudit({ actorId: me.id, action: "category.create", entityType: "category", entityId: row.id, details: { title: t, parentId, via: "drive-explorer", driveError } });
  done();
  return { ok: !driveError, id: row.id, error: driveError ? `נוצרה באתר, אבל לא בדרייב: ${driveError}` : undefined };
}

/** העברת חומרים לארכיון (לא מחיקה): הקובץ עובר ל-_ארכיון/לא ברור, החומר מושהה באתר. שחזור: restoreFromArchiveAction. */
export async function archiveMaterialsAction(ids: number[], reason = "הועבר ידנית מהסייר"): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!ids.length) return { ok: false, error: "לא נבחרו קבצים" };
  const rows = await db.select().from(materials).where(inArray(materials.id, ids));
  const archive = await ensureArchiveFolders();
  const { errors } = await mapPool(rows, 4, async (m) => {
    const fid = driveIdFromUrl(m.fileUrl);
    if (!fid) throw new Error("אין קובץ דרייב לחומר");
    await db.update(materials).set({ status: "suspended" }).where(eq(materials.id, m.id));
    await archiveDriveFile(fid, "unclear", reason, { archive, actorId: me.id, materialId: m.id });
  });
  await logAudit({ actorId: me.id, action: "material.archive", entityType: "material", details: { ids, reason } });
  done();
  return { ok: errors.length === 0, moved: rows.length - errors.length, failed: errors.map((e) => ({ id: e.item.id, error: e.error })) };
}

/** מצרף קבצי דרייב שאינם מקושרים לחומר (למשל נגררו ידנית לתיקייה בדרייב) כחומרי טיוטה בקטגוריה. */
async function adopt(driveIds: string[], categoryId: number, actorId: number, via: string) {
  const out: { id: string; materialId?: number; error?: string }[] = [];
  for (const fid of driveIds) {
    try {
      const f = await driveGet(fid);
      if (!f) throw new Error("הקובץ לא נמצא בדרייב");
      // קובץ שכבר משויך לחומר (למשל חומר מושהה שהועבר לארכיון) — לא יוצרים שורה כפולה, רק מציבים אותו מחדש
      const [existing] = await db.select({ id: materials.id }).from(materials).where(eq(materials.fileUrl, `drive://${fid}`));
      if (existing) {
        await placeMaterial(existing.id, { actorId });
        out.push({ id: fid, materialId: existing.id });
        continue;
      }
      const [row] = await db
        .insert(materials)
        .values({
          categoryId,
          title: stripExtension(f.name).slice(0, 200),
          kind: detectKind(f.name),
          fileUrl: `drive://${fid}`,
          fileName: f.name.slice(0, 255),
          mime: f.mimeType,
          size: f.size ?? 0,
          status: "draft",
          driveOriginalName: f.name,
        })
        .returning({ id: materials.id });
      await placeMaterial(row.id, { actorId });
      await logDriveEvent({ kind: "file.add", materialId: row.id, categoryId, driveId: fid, newValue: f.name, details: { via }, actorId });
      await logAudit({ actorId, action: "material.create", entityType: "material", entityId: row.id, details: { via, categoryId, fileName: f.name } });
      out.push({ id: fid, materialId: row.id });
    } catch (e) {
      out.push({ id: fid, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export async function adoptUnlinkedAction(driveIds: string[], categoryId: number): Promise<ActionResult> {
  const me = await requireAdmin();
  const res = await adopt(driveIds, categoryId, me.id, "drive-explorer");
  done();
  return { ok: res.every((r) => !r.error), moved: res.filter((r) => !r.error).length, failed: res.filter((r) => r.error).map((r) => ({ id: r.id, error: r.error! })) };
}

export async function restoreFromArchiveAction(driveIds: string[], targetCategoryId?: number): Promise<ActionResult> {
  const me = await requireAdmin();
  const failed: { id: string; error: string }[] = [];
  let moved = 0;
  for (const fid of driveIds) {
    try {
      const f = await driveGet(fid);
      if (!f) throw new Error("הקובץ לא נמצא");
      const [byUrl] = await db.select({ id: materials.id }).from(materials).where(eq(materials.fileUrl, `drive://${fid}`));
      const mid = byUrl?.id ?? (f.appProperties.materialId ? Number(f.appProperties.materialId) : null);
      if (mid) {
        const [m] = await db.select().from(materials).where(eq(materials.id, mid));
        if (m) {
          if (targetCategoryId) await db.update(materials).set({ categoryId: targetCategoryId }).where(eq(materials.id, mid));
          if (m.status === "suspended") await db.update(materials).set({ status: "draft" }).where(eq(materials.id, mid));
          await placeMaterial(mid, { actorId: me.id });
          await logDriveEvent({ kind: "file.restore", materialId: mid, driveId: fid, newValue: f.name, actorId: me.id });
          moved++;
          continue;
        }
      }
      if (!targetCategoryId) throw new Error("קובץ יתום — צריך לבחור תיקיית יעד");
      const r = await adopt([fid], targetCategoryId, me.id, "restore-from-archive");
      if (r[0].error) throw new Error(r[0].error);
      await logDriveEvent({ kind: "file.restore", materialId: r[0].materialId, driveId: fid, newValue: f.name, actorId: me.id });
      moved++;
    } catch (e) {
      failed.push({ id: fid, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await logAudit({ actorId: me.id, action: "material.restore", entityType: "material", details: { driveIds, targetCategoryId } });
  done();
  return { ok: failed.length === 0, moved, failed };
}

/** מרענן את קובץ המידע של תיקייה; upload=true מעלה אותו לדרייב כ-_מידע.txt (יוצר/מעדכן במקום). */
export async function refreshInfoAction(categoryId: number | null, upload: boolean): Promise<{ ok: boolean; error?: string; text: string; fileId?: string }> {
  const me = await requireAdmin();
  const snap = await loadInfoSnapshot({ events: 6000 });
  const text = renderFolderInfo(snap, categoryId);
  if (!upload) return { ok: true, text };
  try {
    const folderId = categoryId ? (await ensureCategoryFolder(categoryId, { ...(await loadCategories()), names: new Map(), actorId: me.id })) : (await (await import("@/lib/driveBridgeCore")).getRootFolderId());
    const fileId = await driveUpsertTextFile(folderId, INFO_FILE_NAME, text);
    await logDriveEvent({ kind: "info.update", categoryId, driveId: fileId, actorId: me.id });
    await logAudit({ actorId: me.id, action: "drive.info_upload", entityType: "category", entityId: categoryId, details: { fileId } });
    done(false);
    return { ok: true, text, fileId };
  } catch (e) {
    return { ok: false, text, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * סנכרון מהדרייב, בקבוצות (כל קריאה מטפלת עד 40 תיקיות; ממשיכים עם nextCursor):
 *  - קובץ מקושר שנמצא בתיקייה של קטגוריה אחרת מזו שב-DB (נגרר ידנית בדרייב) ← ה-DB מתעדכן לפי הדרייב
 *  - קובץ לא מקושר בתיקייה ← מצורף כחומר טיוטה
 */
export async function syncFromDriveAction(cursor = 0, onlyCategoryId?: number): Promise<{ ok: boolean; nextCursor: number | null; adopted: number; moved: number; errors: string[]; scanned: number }> {
  const me = await requireAdmin();
  const { all } = await loadCategories();
  let targets = all.filter((c) => c.driveFolderId).sort((a, b) => a.id - b.id);
  if (onlyCategoryId) targets = targets.filter((c) => c.id === onlyCategoryId);
  const batch = targets.slice(cursor, cursor + 40);
  const mats = await db.select({ id: materials.id, categoryId: materials.categoryId, fileUrl: materials.fileUrl }).from(materials);
  const byFile = new Map(mats.map((m) => [driveIdFromUrl(m.fileUrl) ?? "", m]));
  let adopted = 0;
  let moved = 0;
  const errors: string[] = [];
  await mapPool(batch, 5, async (c) => {
    const items = await driveListFolder(c.driveFolderId!);
    for (const i of items) {
      if (i.mimeType === FOLDER_MIME || i.appProperties.siteInfo === "1") continue;
      const m = byFile.get(i.id);
      if (!m) {
        const r = await adopt([i.id], c.id, me.id, "drive-sync");
        if (r[0].error) errors.push(`${i.name}: ${r[0].error}`);
        else adopted++;
      } else if (m.categoryId !== c.id) {
        await db.update(materials).set({ categoryId: c.id }).where(eq(materials.id, m.id));
        await logDriveEvent({ kind: "file.move", materialId: m.id, categoryId: c.id, driveId: i.id, details: { via: "drive-sync", fromCategory: m.categoryId } , actorId: me.id });
        await logAudit({ actorId: me.id, action: "material.move", entityType: "material", entityId: m.id, details: { via: "drive-sync", from: m.categoryId, to: c.id } });
        moved++;
      }
    }
  });
  done();
  const next = cursor + 40 < targets.length ? cursor + 40 : null;
  return { ok: errors.length === 0, nextCursor: next, adopted, moved, errors: errors.slice(0, 20), scanned: batch.length };
}

