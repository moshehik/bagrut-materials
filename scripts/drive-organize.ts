/**
 * מארגן את ארכיון הדרייב כעץ תיקיות שמשקף את עץ הקטגוריות של האתר:
 *   1. תיקייה לכל קטגוריה (כל 984, כולל ריקות), שמורה ב-categories.drive_folder_id
 *   2. כל חומר מועבר לתיקיית הקטגוריה שלו ומקבל את שם הקובץ שלו באתר; השם הישן נשמר בתגית
 *      (materials.drive_original_name + description של הקובץ בדרייב). ה-fileId לא משתנה.
 *   3. כל יתום / גרסה ישנה / לא-ברור מועבר ל-"_ארכיון" (שלוש תתי-תיקיות) — לא נמחק דבר
 *   4. קובץ מידע _מידע.txt בכל תיקייה שיש בה תוכן + בארכיון + בשורש
 * הכל בסקריפט (בלי מודל) — דטרמיניסטי, אידמפוטנטי וניתן לחידוש אחרי הפסקה.
 *
 * הרצה:
 *   npx tsx scripts/drive-organize.ts                         → dry-run (לא כותב כלום), מדפיס תוכנית
 *   npx tsx scripts/drive-organize.ts --apply --category=<id> → פיילוט: רק קטגוריה אחת (+ אבותיה)
 *   npx tsx scripts/drive-organize.ts --apply                 → הכל
 *   אפשרויות: --skip-archive  --skip-info  --concurrency=6
 * לפני כל כתיבה נשמר גיבוי (id/שם/הורים לכל קובץ בשורש) ב-_drive_organize_backup_<זמן>.json (gitignored).
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
dotenv.config({ path: ".env.local" });


import { db } from "../src/db";
import { materials } from "../src/db/schema";
import { driveIdFromUrl, getRootFolderId, PDF_CACHE_FOLDER_NAME } from "../src/lib/driveBridgeCore";
import {
  FOLDER_MIME,
  ARCHIVE_FOLDER_NAME,
  ARCHIVE_SUB,
  INFO_FILE_NAME,
  type ArchiveKind,
  type DriveItem,
  driveListFolder,
  driveUpsertTextFile,
  ensureArchiveFolders,
  ensureCategoryFolder,
  archiveDriveFile,
  placeMaterial,
  planFolderNames,
  loadCategories,
  loadLinkedDriveIds,
  mapPool,
  logDriveEvent,
} from "../src/lib/driveTreeCore";
import { loadInfoSnapshot, renderFolderInfo, renderArchiveInfo } from "../src/lib/driveFolderInfo";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const val = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const APPLY = flag("apply");
const PILOT = val("category") ? Number(val("category")) : null;
const CONC = Number(val("concurrency") ?? 6);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const progress = (label: string) => (d: number, t: number) => {
  if (d % 100 === 0 || d === t) console.log(`  ${label}: ${d}/${t}`);
};

async function main() {
  console.log(APPLY ? `== APPLY ${PILOT ? `(פיילוט קטגוריה ${PILOT})` : "(הכל)"} ==` : "== DRY-RUN (לא נכתב כלום) ==");
  const rootId = await getRootFolderId();
  const { byId, all } = await loadCategories();
  const names = planFolderNames(all);

  // תת-קבוצת קטגוריות לפיילוט: הקטגוריה + אבותיה (לתיקיות) ; חומרים רק של הקטגוריה
  const wanted = new Set<number>();
  if (PILOT) {
    if (!byId.has(PILOT)) throw new Error(`קטגוריה ${PILOT} לא קיימת`);
    let cur = byId.get(PILOT);
    while (cur) {
      wanted.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  const catsToEnsure = all.filter((c) => !PILOT || wanted.has(c.id));

  const rootChildren = await driveListFolder(rootId);
  const mats = await db.select().from(materials);
  const driveMats = mats
    .map((m) => ({ m, fileId: driveIdFromUrl(m.fileUrl) }))
    .filter((x): x is { m: typeof x.m; fileId: string } => !!x.fileId)
    .filter((x) => !PILOT || x.m.categoryId === PILOT);

  // --- סיווג יתומים/לא-ברור (לפי מצב השורש לפני השינוי) ---
  // כולל קבצי שיחות והצעות מכירה — אלה לא יתומים גם אם אינם חומרים
  const linked = await loadLinkedDriveIds();
  const catFolders = new Set(all.map((c) => c.driveFolderId).filter(Boolean) as string[]);
  const linkedNames = new Set(rootChildren.filter((f) => linked.has(f.id)).map((f) => f.name));
  const classify = (f: DriveItem): { kind: ArchiveKind; reason: string } | null => {
    if (f.mimeType === FOLDER_MIME) {
      if (catFolders.has(f.id) || f.name === ARCHIVE_FOLDER_NAME) return null;
      // מטמון ה-PDF המומר (convertOfficeToPdfCached) – תיקיית מערכת, לא "לא ברור"
      if (f.name === PDF_CACHE_FOLDER_NAME || f.appProperties.pdfCache === "1") return null;
      return { kind: "unclear", reason: "תיקייה שלא שייכת לעץ האתר" };
    }
    if (linked.has(f.id)) return null;
    if (f.appProperties.siteInfo === "1") return null;
    if (/BEFORE|BACKUP|גיבוי/i.test(f.name)) return { kind: "oldVersions", reason: "גיבוי/גרסה ישנה לפי השם, לא מקושר לחומר" };
    if (!/\.docx$/i.test(f.name)) return { kind: "unclear", reason: "סוג קובץ לא צפוי, לא מקושר לחומר" };
    if (linkedNames.has(f.name)) return { kind: "oldVersions", reason: "אותו שם כמו קובץ פעיל — גרסה ישנה שהוחלפה" };
    return { kind: "orphans", reason: "לא מקושר לאף חומר באתר" };
  };
  const toArchive = rootChildren.map((f) => ({ f, c: classify(f) })).filter((x): x is { f: DriveItem; c: NonNullable<ReturnType<typeof classify>> } => !!x.c);

  // --- דו"ח תוכנית ---
  const pendingFolders = catsToEnsure.filter((c) => !c.driveFolderId).length;
  const byCat = new Map<number, typeof driveMats>();
  for (const x of driveMats) byCat.set(x.m.categoryId, [...(byCat.get(x.m.categoryId) ?? []), x]);
  let collisions = 0;
  for (const list of byCat.values()) {
    const seen = new Set<string>();
    for (const x of list) {
      const n = x.m.fileName;
      if (seen.has(n)) collisions++;
      seen.add(n);
    }
  }
  const archCount = { orphans: 0, oldVersions: 0, unclear: 0 } as Record<ArchiveKind, number>;
  for (const x of toArchive) archCount[x.c.kind]++;
  console.log(
    `תיקיות לקטגוריות: ${catsToEnsure.length} (חדשות ליצירה: ${pendingFolders})\n` +
      `חומרים להצבה (דרייב): ${driveMats.length} בתוך ${byCat.size} קטגוריות · התנגשויות שם (יקבלו #id): ${collisions}\n` +
      `לארכיון: ${toArchive.length} (יתומים ${archCount.orphans} · גרסאות ישנות ${archCount.oldVersions} · לא ברור ${archCount.unclear})` +
      (PILOT ? "  [פיילוט: הארכיון לא רץ אלא אם --archive]" : ""),
  );
  for (const x of driveMats.slice(0, 5)) {
    console.log(`  • #${x.m.id} "${rootChildren.find((f) => f.id === x.fileId)?.name}" → [${(byId.get(x.m.categoryId)?.title ?? "")}] "${x.m.fileName}"`);
  }
  if (!APPLY) return;

  // --- גיבוי לפני שינוי ---
  const backupFile = `_drive_organize_backup_${stamp}.json`;
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        rootId,
        files: rootChildren.map((f) => ({ id: f.id, name: f.name, parents: f.parents, mimeType: f.mimeType })),
        materials: mats.map((m) => ({ id: m.id, fileUrl: m.fileUrl, fileName: m.fileName, categoryId: m.categoryId, driveOriginalName: m.driveOriginalName })),
        categoryFolders: all.map((c) => ({ id: c.id, driveFolderId: c.driveFolderId })),
      },
      null,
      1,
    ),
    "utf8",
  );
  console.log(`גיבוי נשמר: ${backupFile}`);

  const log: Record<string, unknown> = { at: stamp, pilot: PILOT };

  // --- 1. תיקיות (לפי עומק, כדי שההורה יהיה קיים) ---
  const depth = (id: number): number => {
    let d = 0;
    let cur = byId.get(id);
    while (cur?.parentId) {
      d++;
      cur = byId.get(cur.parentId);
    }
    return d;
  };
  const ctx = { byId, names, rootId, verified: new Set<number>() };
  const levels = new Map<number, number[]>();
  for (const c of catsToEnsure) levels.set(depth(c.id), [...(levels.get(depth(c.id)) ?? []), c.id]);
  let folderErrors = 0;
  for (const d of [...levels.keys()].sort((a, b) => a - b)) {
    const { errors } = await mapPool(levels.get(d)!, CONC, (id) => ensureCategoryFolder(id, ctx), progress(`תיקיות עומק ${d}`));
    folderErrors += errors.length;
    for (const e of errors) console.error("  שגיאת תיקייה:", e.item, e.error);
  }
  log.folderErrors = folderErrors;

  // --- 2. חומרים: במקביל בין קטגוריות, ברצף בתוך קטגוריה (כדי שהצמדת #id תהיה דטרמיניסטית) ---
  const catIds = [...byCat.keys()];
  const placed = { moved: 0, renamed: 0, unchanged: 0 };
  const { errors: matErrors } = await mapPool(
    catIds,
    CONC,
    async (catId) => {
      const folderId = byId.get(catId)!.driveFolderId!;
      const existing = await driveListFolder(folderId);
      const own = new Set(byCat.get(catId)!.map((x) => x.fileId));
      const taken = new Set(existing.filter((f) => !own.has(f.id)).map((f) => f.name));
      for (const x of [...byCat.get(catId)!].sort((a, b) => a.m.id - b.m.id)) {
        const r = await placeMaterial(x.m.id, { ctx, takenNames: taken });
        if (!r) continue;
        if (r.moved) placed.moved++;
        if (r.renamed) placed.renamed++;
        if (!r.moved && !r.renamed) placed.unchanged++;
      }
    },
    progress("קטגוריות עם חומרים"),
  );
  for (const e of matErrors) console.error("  שגיאת חומרים בקטגוריה", e.item, e.error);
  log.placed = placed;
  log.materialErrors = matErrors.length;
  console.log("הצבה:", placed);

  // --- 3. ארכיון ---
  if (!PILOT || flag("archive")) {
    if (!flag("skip-archive")) {
      const archive = await ensureArchiveFolders();
      const { errors } = await mapPool(toArchive, CONC, (x) => archiveDriveFile(x.f.id, x.c.kind, x.c.reason, { archive }), progress("ארכיון"));
      for (const e of errors) console.error("  שגיאת ארכיון:", e.item.f.name, e.error);
      log.archived = toArchive.length - errors.length;
      log.archiveErrors = errors.length;
    }
  }

  // --- 4. קבצי מידע ---
  if (!flag("skip-info")) {
    const snap = await loadInfoSnapshot();
    const hasContent = (id: number): boolean => (snap.matsByCat.get(id)?.length ?? 0) > 0 || (snap.children.get(id) ?? []).some((c) => hasContent(c.id));
    const targets = snap.cats.filter((c) => c.driveFolderId && hasContent(c.id) && (!PILOT || wanted.has(c.id)));
    const { errors } = await mapPool(
      targets,
      4,
      async (c) => {
        await driveUpsertTextFile(c.driveFolderId!, INFO_FILE_NAME, renderFolderInfo(snap, c.id));
      },
      progress("קבצי מידע"),
    );
    for (const e of errors) console.error("  שגיאת מידע:", e.item.title, e.error);
    if (!PILOT) {
      await driveUpsertTextFile(rootId, INFO_FILE_NAME, renderFolderInfo(snap, null));
      const archive = await ensureArchiveFolders();
      const items: { sub: ArchiveKind; item: DriveItem }[] = [];
      for (const k of Object.keys(ARCHIVE_SUB) as ArchiveKind[]) for (const item of await driveListFolder(archive.sub[k])) items.push({ sub: k, item });
      await driveUpsertTextFile(archive.root, INFO_FILE_NAME, renderArchiveInfo(items));
      await logDriveEvent({ kind: "info.update", details: { folders: targets.length, scope: "all" } });
    }
    log.infoFiles = targets.length;
    log.infoErrors = errors.length;
  }

  fs.writeFileSync(`_drive_organize_log_${stamp}.json`, JSON.stringify(log, null, 1), "utf8");
  console.log("סיום:", JSON.stringify(log));
}



main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
