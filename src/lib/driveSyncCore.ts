/**
 * ליבת הסנכרון מהדרייב — משותפת לכפתור "סנכרון עם הדרייב" בסייר (server action) ולסקריפט הלילי
 * (scripts/drive-sync.ts, מופעל ע"י .github/workflows/drive-sync.yml — כבוי כברירת מחדל).
 * בלי "server-only" ובלי תלות ב-next/cache, כדי שתרוץ גם תחת tsx. רישום audit מוזרק (ctx.audit):
 * האתר מזריק logAudit, הסקריפט — כתיבה ישירה ל-audit_logs.
 *
 * מה הסנכרון עושה (לעולם לא מוחק):
 *  - קובץ מקושר שנמצא בתיקייה של קטגוריה אחרת מזו שב-DB ← ה-DB מתעדכן לפי הדרייב
 *  - קובץ חדש שהוא החלפה של חומר קיים (מחקו את הישן והדביקו חדש באותו שם) ← החומר הקיים מחובר לקובץ החדש
 *  - קובץ לא מקושר אחר ← חומר טיוטה חדש בקטגוריה
 *  - גודל שהשתנה (גרסה חדשה של אותו קובץ) ← עדכון הגודל ב-DB
 * dryRun: סופר ומתאר מה *היה* קורה, בלי לכתוב כלום.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { materials } from "@/db/schema";
import { driveIdFromUrl } from "@/lib/driveBridgeCore";
import { detectKind, stripExtension } from "@/lib/admin-utils";
import { FOLDER_MIME, driveGet, driveListFolder, loadCategories, logDriveEvent, mapPool, placeMaterial } from "@/lib/driveTreeCore";

export type SyncAudit = (a: { action: string; entityType?: string; entityId?: number | null; details?: unknown }) => Promise<void>;
export type SyncCtx = { actorId: number | null; via: string; audit: SyncAudit; dryRun?: boolean };

/** מסיר תווי כיווניות מוסתרים ורווחים מיותרים משם קובץ שמגיע מ-Windows/Drive for desktop. */
export function cleanName(n: string) {
  return n.replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
}

/** שם להשוואה: בלי סיומת, בלי "(נערך ...)", "(1)" או "- עותק". */
export function cmpName(n: string) {
  return cleanName(n)
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\(נערך \d{2}\.\d{2}\.\d{4}\)\s*$/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\s*-\s*עותק(?:\s*\(\d+\))?\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** מצרף קבצי דרייב לא מקושרים כחומרי טיוטה בקטגוריה (או מציב מחדש חומר קיים שכבר מצביע על הקובץ). */
export async function adoptFiles(driveIds: string[], categoryId: number, ctx: SyncCtx) {
  const out: { id: string; materialId?: number; error?: string }[] = [];
  for (const fid of driveIds) {
    try {
      const f = await driveGet(fid);
      if (!f) throw new Error("הקובץ לא נמצא בדרייב");
      const [existing] = await db.select({ id: materials.id }).from(materials).where(eq(materials.fileUrl, `drive://${fid}`));
      if (existing) {
        if (!ctx.dryRun) await placeMaterial(existing.id, { actorId: ctx.actorId });
        out.push({ id: fid, materialId: existing.id });
        continue;
      }
      if (ctx.dryRun) {
        out.push({ id: fid });
        continue;
      }
      const [row] = await db
        .insert(materials)
        .values({
          categoryId,
          title: stripExtension(cleanName(f.name)).slice(0, 200),
          kind: detectKind(cleanName(f.name)),
          fileUrl: `drive://${fid}`,
          fileName: cleanName(f.name).slice(0, 255),
          mime: f.mimeType,
          size: f.size ?? 0,
          status: "draft",
          driveOriginalName: f.name,
        })
        .returning({ id: materials.id });
      await placeMaterial(row.id, { actorId: ctx.actorId });
      await logDriveEvent({ kind: "file.add", materialId: row.id, categoryId, driveId: fid, newValue: f.name, details: { via: ctx.via }, actorId: ctx.actorId });
      await ctx.audit({ action: "material.create", entityType: "material", entityId: row.id, details: { via: ctx.via, categoryId, fileName: f.name } });
      out.push({ id: fid, materialId: row.id });
    } catch (e) {
      out.push({ id: fid, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export type SyncBatchResult = {
  ok: boolean;
  nextCursor: number | null;
  adopted: number;
  moved: number;
  relinked: number;
  resized: number;
  errors: string[];
  scanned: number;
  notes: string[];
};

/** סורק עד 40 תיקיות (מ-cursor). ממשיכים עם nextCursor עד null. */
export async function syncBatch(cursor: number, onlyCategoryId: number | undefined, ctx: SyncCtx): Promise<SyncBatchResult> {
  const { all } = await loadCategories();
  let targets = all.filter((c) => c.driveFolderId).sort((a, b) => a.id - b.id);
  if (onlyCategoryId) targets = targets.filter((c) => c.id === onlyCategoryId);
  const batch = targets.slice(cursor, cursor + 40);
  const mats = await db
    .select({ id: materials.id, categoryId: materials.categoryId, fileUrl: materials.fileUrl, fileName: materials.fileName, size: materials.size, orig: materials.driveOriginalName })
    .from(materials);
  const byFile = new Map(mats.map((m) => [driveIdFromUrl(m.fileUrl) ?? "", m]));
  let adopted = 0;
  let moved = 0;
  let relinked = 0;
  let resized = 0;
  const errors: string[] = [];
  const notes: string[] = [];
  const note = (s: string) => {
    if (notes.length < 200) notes.push(s);
  };

  await mapPool(batch, 5, async (c) => {
    const items = await driveListFolder(c.driveFolderId!);
    const present = new Set(items.map((i) => i.id));
    const st: { orphaned: typeof mats | null } = { orphaned: null };
    const orphanedMats = async () => {
      if (st.orphaned) return st.orphaned;
      const cand = mats.filter((m) => m.categoryId === c.id && !present.has(driveIdFromUrl(m.fileUrl) ?? ""));
      const gone: typeof mats = [];
      for (const m of cand) if (!(await driveGet(driveIdFromUrl(m.fileUrl)!))) gone.push(m);
      return (st.orphaned = gone);
    };
    for (const i of items) {
      if (i.mimeType === FOLDER_MIME || i.appProperties.siteInfo === "1") continue;
      const m = byFile.get(i.id);
      if (!m) {
        const n = cmpName(i.name);
        const matches = (await orphanedMats()).filter((x) => cmpName(x.fileName) === n || (x.orig && cmpName(x.orig) === n));
        if (matches.length === 1) {
          const t = matches[0];
          note(`החלפה: "${i.name}" ← חומר #${t.id} "${t.fileName}" [${c.title}]`);
          if (!ctx.dryRun) {
            await db.update(materials).set({ fileUrl: `drive://${i.id}`, size: i.size ?? t.size, mime: i.mimeType }).where(eq(materials.id, t.id));
            st.orphaned = (st.orphaned ?? []).filter((x) => x.id !== t.id);
            byFile.set(i.id, { ...t, fileUrl: `drive://${i.id}` });
            try {
              await placeMaterial(t.id, { actorId: ctx.actorId });
            } catch (e) {
              errors.push(`${i.name}: חובר לחומר #${t.id} אך ההצבה נכשלה (${e instanceof Error ? e.message : e})`);
            }
            await logDriveEvent({ kind: "file.replace", materialId: t.id, categoryId: c.id, driveId: i.id, oldValue: t.fileUrl, newValue: `drive://${i.id}`, details: { via: ctx.via, name: i.name }, actorId: ctx.actorId });
            await ctx.audit({ action: "material.relink", entityType: "material", entityId: t.id, details: { via: ctx.via, newFileId: i.id, name: i.name } });
          }
          relinked++;
          continue;
        }
        note(`קובץ חדש: "${cleanName(i.name)}" ← טיוטה ב-[${c.title}]`);
        const r = await adoptFiles([i.id], c.id, ctx);
        if (r[0].error) errors.push(`${i.name}: ${r[0].error}`);
        else adopted++;
      } else if (m.categoryId !== c.id) {
        note(`הועבר בדרייב: חומר #${m.id} "${m.fileName}" ← [${c.title}]`);
        if (!ctx.dryRun) {
          await db.update(materials).set({ categoryId: c.id }).where(eq(materials.id, m.id));
          await logDriveEvent({ kind: "file.move", materialId: m.id, categoryId: c.id, driveId: i.id, details: { via: ctx.via, fromCategory: m.categoryId }, actorId: ctx.actorId });
          await ctx.audit({ action: "material.move", entityType: "material", entityId: m.id, details: { via: ctx.via, from: m.categoryId, to: c.id } });
        }
        moved++;
      } else if (i.size && i.size !== m.size) {
        note(`גודל השתנה: חומר #${m.id} "${m.fileName}" ${m.size} ← ${i.size}`);
        if (!ctx.dryRun) {
          await db.update(materials).set({ size: i.size }).where(eq(materials.id, m.id));
          await logDriveEvent({ kind: "file.resize", materialId: m.id, categoryId: c.id, driveId: i.id, oldValue: String(m.size), newValue: String(i.size), details: { via: ctx.via }, actorId: ctx.actorId });
        }
        resized++;
      }
    }
  });
  const next = cursor + 40 < targets.length ? cursor + 40 : null;
  return { ok: errors.length === 0, nextCursor: next, adopted, moved, relinked, resized, errors: errors.slice(0, 20), scanned: batch.length, notes };
}
