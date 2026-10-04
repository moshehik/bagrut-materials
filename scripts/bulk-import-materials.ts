/**
 * מייבא באצווה קבצי חומר גמור מתוך "חומרים מוכנים מחדש/" לפי קובץ מיפוי
 * (folder/file → categoryId) שהופק בתהליך סיווג נפרד — ר' [מתודולוגיה.md] תחת
 * "חומרים מוכנים מחדש/_ייבוא-לאתר/". לכל קובץ: מעלה לדרייב (driveUpload, כמו
 * import-local-material.ts) ויוצר שורת materials בסטטוס draft (בטוח - לא עולה
 * חי בלי סקירה ידנית). כל האחסון בדרייב (drive://).
 *
 * אידמפוטנטי: שומר/קורא יומן סטטוס (JSON) ומדלג על קבצים שכבר יובאו בהצלחה
 * בעבר - אפשר להריץ שוב על אותו מיפוי (או מיפוי מורחב בעתיד) בלי כפילויות.
 *
 * קלט מיפוי - מערך של קבוצות:
 *   [{ categoryId: number|null, categoryPath?: string, confidence: "high"|"medium"|"low",
 *      files: string[] (יחסית ל-"חומרים מוכנים מחדש/"), note?: string }]
 *
 * הרצה:
 *   npx tsx scripts/bulk-import-materials.ts --mapping "<path>" --status "<path>" \
 *     [--confidence-at-least high|medium|low] [--dry-run] [--limit N]
 *
 * ברירות מחדל: confidence-at-least=high (הכי בטוח - רק קבוצות שסומנו high בסיווג),
 * status=חומרים מוכנים מחדש/_ייבוא-לאתר/סטטוס-ייבוא.json
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  driveUpload,
  driveUrlFor,
  driveFindFoldersByName,
  driveListChildren,
  driveCopyFile,
  getRootFolderId,
} from "../src/lib/driveBridgeCore";
import { detectKind, stripExtension } from "../src/lib/admin-utils";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}
const db = drizzle(neon(url), { schema });
const { materials, categories } = schema;

const MATERIALS_ROOT = "חומרים מוכנים מחדש";
const CONF_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

// כמה תיקיות/קבצים במקור נוצרו דרך שכבת POSIX (WSL/git) עם תו לא-חוקי ב-NTFS
// בשם (כמו " במקום גרשיים) - השכבה ההיא שומרת אותו כקוד-נקודה בטווח Private
// Use (למשל U+F022 במקום U+0022 הרגיל), אז מה שמוצג בטרמינל כ-" הוא בפועל
// תו אחר לגמרי מה-fs.existsSync/readFileSync הרגילים של Node על Windows.
// פותרים לפי השם האמיתי בדיסק (מול תיקיית האב) במקום השוואת מחרוזת ישירה.
const WSL_PUA_MAP: Record<string, string> = {
  '"': "",
  "*": "",
  ":": "",
  "<": "",
  ">": "",
  "?": "",
  "|": "",
};
function normalizeForCompare(s: string) {
  let out = s;
  for (const [ascii, pua] of Object.entries(WSL_PUA_MAP)) out = out.split(pua).join(ascii);
  return out;
}
/** מוצא את הנתיב האמיתי בדיסק עבור relFile (יחסי ל-MATERIALS_ROOT), גם אם שם
 * תיקייה/קובץ במיפוי כתוב עם תו "רגיל" שבפועל מוחלף בדיסק בקוד-נקודה מיוחד. */
function resolveOnDisk(relFile: string): string | null {
  const parts = relFile.split(/[\\/]/).filter(Boolean);
  let cur = MATERIALS_ROOT;
  for (const part of parts) {
    const direct = path.join(cur, part);
    if (fs.existsSync(direct)) {
      cur = direct;
      continue;
    }
    let found: string | undefined;
    try {
      const target = normalizeForCompare(part);
      found = fs.readdirSync(cur).find((e) => normalizeForCompare(e) === target);
    } catch {
      return null;
    }
    if (!found) return null;
    cur = path.join(cur, found);
  }
  return cur;
}

/**
 * בונה אינדקס path-יחסי -> {id,mimeType} מגיבוי מקומי שכבר יושב בדרייב (אותו
 * חשבון), על ידי מעבר BFS על עץ התיקיות. מאפשר להעתיק קבצים בתוך דרייב
 * (driveCopyFile - פעולת שרת, אלפיות שנייה) במקום לקרוא בייטים מהדיסק
 * ולהעלות אותם מחדש דרך הגשר (driveUpload - שניות לקובץ, הצוואר-בקבוק
 * העיקרי בהרצה על אלפי קבצים). מפתחות מנורמלים באותה נורמליזציה כמו
 * resolveOnDisk (תווי Private-Use שמקורם בשכבת POSIX/WSL).
 */
async function buildDriveBackupIndex(
  rootFolderId: string,
): Promise<Map<string, { id: string; mimeType: string }>> {
  const index = new Map<string, { id: string; mimeType: string }>();
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  let foldersScanned = 0;
  async function walk(folderId: string, prefix: string) {
    const children = await driveListChildren(folderId);
    foldersScanned++;
    for (const child of children) {
      const relPath = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.mimeType === FOLDER_MIME) {
        await walk(child.id, relPath);
      } else {
        index.set(normalizeForCompare(relPath), { id: child.id, mimeType: child.mimeType });
      }
    }
  }
  await walk(rootFolderId, "");
  console.log(`אינדקס גיבוי-דרייב: ${foldersScanned} תיקיות נסרקו, ${index.size} קבצים נמצאו.`);
  return index;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
};

type MappingGroup = {
  categoryId: number | null;
  categoryPath?: string;
  confidence: "high" | "medium" | "low";
  files: string[];
  note?: string;
};

type StatusEntry = {
  file: string;
  categoryId: number | null;
  materialId?: number;
  driveFileId?: string;
  importedAt?: string;
  status: "imported" | "skipped" | "error";
  error?: string;
};

async function main() {
  const mappingPath = arg("mapping");
  if (!mappingPath) {
    console.error("חובה: --mapping <path>");
    process.exit(1);
  }
  const statusPath =
    arg("status") || path.join(MATERIALS_ROOT, "_ייבוא-לאתר", "סטטוס-ייבוא.json");
  const minConfidence = arg("confidence-at-least") || "high";
  const dryRun = hasFlag("dry-run");
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  const useDriveBackup = hasFlag("use-drive-backup");

  let driveBackupIndex: Map<string, { id: string; mimeType: string }> | null = null;
  let archiveRootId: string | null = null;
  let copiedCount = 0;
  let uploadedCount = 0;
  if (useDriveBackup) {
    const folders = await driveFindFoldersByName(path.basename(MATERIALS_ROOT));
    if (folders.length !== 1) {
      console.error(
        `--use-drive-backup: נמצאו ${folders.length} תיקיות בשם "${MATERIALS_ROOT}" בדרייב (צריך בדיוק אחת) - ממשיך בלי אינדקס גיבוי, כל הקבצים יעלו מהדיסק.`,
      );
    } else {
      console.log(`נמצאה תיקיית גיבוי בדרייב: ${folders[0].id} - בונה אינדקס...`);
      driveBackupIndex = await buildDriveBackupIndex(folders[0].id);
      archiveRootId = await getRootFolderId();
    }
  }

  const groups: MappingGroup[] = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));

  const statusLog: StatusEntry[] = fs.existsSync(statusPath)
    ? JSON.parse(fs.readFileSync(statusPath, "utf-8"))
    : [];
  const alreadyImported = new Set(
    statusLog.filter((e) => e.status === "imported").map((e) => e.file),
  );

  function saveLog() {
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    fs.writeFileSync(statusPath, JSON.stringify(statusLog, null, 1), "utf-8");
  }

  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const group of groups) {
    if (group.categoryId == null) {
      for (const f of group.files) {
        if (alreadyImported.has(f)) continue;
        statusLog.push({ file: f, categoryId: null, status: "skipped", error: group.note || "אין קטגוריה מתאימה" });
        skipped++;
      }
      continue;
    }
    if (CONF_RANK[group.confidence] < CONF_RANK[minConfidence]) {
      for (const f of group.files) {
        if (alreadyImported.has(f)) continue;
        statusLog.push({
          file: f,
          categoryId: group.categoryId,
          status: "skipped",
          error: `confidence=${group.confidence} מתחת לסף (${minConfidence})`,
        });
        skipped++;
      }
      continue;
    }

    const [category] = await db.select().from(categories).where(eq(categories.id, group.categoryId)).limit(1);
    if (!category) {
      console.error(`אזהרה: categoryId=${group.categoryId} (${group.categoryPath}) לא קיים ב-DB - מדלג על ${group.files.length} קבצים`);
      for (const f of group.files) {
        statusLog.push({ file: f, categoryId: group.categoryId, status: "error", error: "categoryId לא קיים ב-DB" });
        errors++;
      }
      continue;
    }

    for (const relFile of group.files) {
      if (processed >= limit) break;
      if (alreadyImported.has(relFile)) continue;
      processed++;

      const resolved = resolveOnDisk(relFile);
      const filePath = resolved ?? path.join(MATERIALS_ROOT, relFile);
      const fileName = path.basename(relFile);
      // קבצי נעילה זמניים של Word (למשל "~$דף למורה.docx") - אף פעם לא תוכן אמיתי
      if (fileName.startsWith("~$")) {
        statusLog.push({ file: relFile, categoryId: group.categoryId, status: "skipped", error: "קובץ נעילה זמני של Word (~$)" });
        skipped++;
        continue;
      }
      if (!fs.existsSync(filePath)) {
        console.error(`הקובץ לא נמצא, מדלג: ${filePath}`);
        statusLog.push({ file: relFile, categoryId: group.categoryId, status: "error", error: "הקובץ לא נמצא בדיסק" });
        errors++;
        continue;
      }

      const ext = path.extname(fileName).toLowerCase();
      const mime = MIME_BY_EXT[ext] || "application/octet-stream";
      const title = stripExtension(fileName);
      const kind = detectKind(fileName);

      const backupEntry = driveBackupIndex?.get(normalizeForCompare(relFile));

      if (dryRun) {
        const via = backupEntry && archiveRootId ? "העתקה בדרייב" : "העלאה מהדיסק";
        console.log(`[dry-run] "${fileName}" → קטגוריה #${category.id} "${category.title}" (kind=${kind}, ${via})`);
        continue;
      }

      try {
        let fileId: string;
        let size: number;
        if (backupEntry && archiveRootId) {
          try {
            console.log(`מעתיק (בתוך דרייב) "${fileName}" → #${category.id} "${category.title}"...`);
            const copied = await driveCopyFile(backupEntry.id, { name: fileName, parentId: archiveRootId });
            fileId = copied.fileId;
            size = copied.size || fs.statSync(filePath).size;
            copiedCount++;
          } catch (copyErr) {
            console.error(
              `  העתקה נכשלה (${copyErr instanceof Error ? copyErr.message : copyErr}) - נופל חזרה להעלאה מהדיסק...`,
            );
            const bytes = fs.readFileSync(filePath);
            const uploaded = await driveUpload({ name: fileName, mimeType: mime, bytes });
            fileId = uploaded.fileId;
            size = bytes.length;
            uploadedCount++;
          }
        } else {
          const bytes = fs.readFileSync(filePath);
          console.log(`מעלה "${fileName}" (${(bytes.length / 1024).toFixed(0)}KB) → #${category.id} "${category.title}"...`);
          const uploaded = await driveUpload({ name: fileName, mimeType: mime, bytes });
          fileId = uploaded.fileId;
          size = bytes.length;
          uploadedCount++;
        }
        const fileUrl = driveUrlFor(fileId);

        const [row] = await db
          .insert(materials)
          .values({
            categoryId: category.id,
            title,
            kind,
            fileUrl,
            fileName,
            mime,
            size,
            price: 1500,
            premiumOnly: false,
            minTier: "none",
            access: "paid",
            status: "draft",
          })
          .returning({ id: materials.id });

        statusLog.push({
          file: relFile,
          categoryId: group.categoryId,
          materialId: row.id,
          driveFileId: fileId,
          importedAt: new Date().toISOString(),
          status: "imported",
        });
        imported++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`שגיאה בייבוא "${fileName}": ${msg}`);
        statusLog.push({ file: relFile, categoryId: group.categoryId, status: "error", error: msg });
        errors++;
      }

      if (imported % 20 === 0 && imported > 0) saveLog();
    }
  }

  if (!dryRun) saveLog();
  const viaNote = useDriveBackup ? ` (${copiedCount} בהעתקה בדרייב, ${uploadedCount} בהעלאה מהדיסק)` : "";
  console.log(
    `\nסיכום: ${imported} יובאו${viaNote}, ${skipped} דולגו (confidence/ללא קטגוריה), ${errors} שגיאות. יומן: ${statusPath}`,
  );
}

main().catch((e) => {
  console.error("שגיאה כללית:", e);
  process.exit(1);
});
