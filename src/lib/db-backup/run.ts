/**
 * הרצת גיבוי מסד הנתונים: הפקה → העלאה לתיקייה ייעודית בדרייב → אימות גודל → שימור (14 יומיים + 8 שבועיים) → רישום מצב/audit →
 * התראת מייל בכשלונות רצופים. נקרא מהכרון /api/cron/db-backup (כל 6 שעות; בפועל גיבוי אחד ביום, וניסיון חוזר אם נכשל) ומ-scripts/db-backup.ts.
 * בלי "server-only" כדי שגם סקריפט יוכל לקרוא לו; ההתראה במייל מוזרקת מבחוץ (notify). ר' docs/db-backup.md.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, settings } from "@/db/schema";
import { driveFetchAuthed, driveListChildren, driveUploadRest } from "@/lib/driveBridgeCore";
import { dumpDatabase, neonQueryFn } from "./dump";
import {
  BACKUP_FOLDER_NAME,
  backupFileName,
  isBackupDue,
  parseBackupName,
  parseState,
  selectRetention,
  shouldAlert,
  type BackupState,
} from "./logic";

export const STATE_KEY = "db_backup_state";
export const ENABLED_KEY = "db_backup_enabled";
/** ריצה שנתפסה (נעילה) נחשבת תקועה אחרי כך */
const LOCK_MINUTES = 15;

export type BackupOutcome =
  | { status: "skipped"; reason: string }
  | { status: "ok"; name: string; fileId: string; bytes: number; tables: number; rows: number; removed: string[]; ms: number }
  | { status: "failed"; error: string; consecutiveFailures: number; alerted: boolean };

export type Notify = (subject: string, text: string) => Promise<void>;

async function readState(): Promise<BackupState> {
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, STATE_KEY)).limit(1);
  return parseState(rows[0]?.value);
}

export async function getBackupState(): Promise<BackupState> {
  return readState();
}

async function writeState(s: BackupState) {
  const value = JSON.stringify(s);
  await db
    .insert(settings)
    .values({ key: STATE_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

/** תופס את הנעילה: כותב את זמן הניסיון רק אם אין ריצה פעילה (updated_at ישן מ-LOCK_MINUTES). force עוקף. */
async function claim(state: BackupState, now: Date, force: boolean): Promise<boolean> {
  const value = JSON.stringify({ ...state, lastAttemptAt: now.toISOString() });
  if (force) {
    await writeState({ ...state, lastAttemptAt: now.toISOString() });
    return true;
  }
  const rows = await db
    .insert(settings)
    .values({ key: STATE_KEY, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
      setWhere: sql`${settings.updatedAt} < now() - (${LOCK_MINUTES} * interval '1 minute')`,
    })
    .returning({ key: settings.key });
  return rows.length > 0;
}

async function isEnabled(): Promise<boolean> {
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, ENABLED_KEY)).limit(1);
  return (rows[0]?.value ?? "true") !== "false";
}

let folderCache: string | null = null;

/**
 * תיקיית הגיבויים בשורש ה-My Drive, **מחוץ** לתיקיית הארכיון של האתר (כמו תיקיית התמונות הגולמיות של תור המצגות) — כדי ש-drive-sync,
 * סייר הדרייב וה-orphans לא יצרפו את קבצי הגיבוי כחומרים. נמצאת לפי שם; נוצרת אם חסרה. פרטית — לא משותפת לאף אחד.
 */
export async function getBackupFolderId(): Promise<string> {
  if (folderCache) return folderCache;
  const q = `name = '${BACKUP_FOLDER_NAME.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and 'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await driveFetchAuthed(
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`,
    {},
    { tries: 2, timeoutMs: 20_000 },
  );
  if (found.ok) {
    const j = (await found.json()) as { files?: { id: string }[] };
    if (j.files?.[0]?.id) return (folderCache = j.files[0].id);
  }
  const created = await driveFetchAuthed(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: BACKUP_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
        parents: ["root"],
        appProperties: { dbBackup: "1" },
        description: "גיבוי יומי של מסד הנתונים (Neon): משתמשות, רכישות, לוגים. האתר מנהל את התיקייה (docs/db-backup.md) — לא למחוק ולא לשתף.",
      }),
    },
    { tries: 1, timeoutMs: 20_000 },
  );
  if (!created.ok) throw new Error(`יצירת תיקיית הגיבויים בדרייב נכשלה (${created.status})`);
  return (folderCache = ((await created.json()) as { id: string }).id);
}

/** מעביר לפח של דרייב (ניתן לשחזור 30 יום) — לא מחיקה סופית */
async function trashFile(fileId: string) {
  const res = await driveFetchAuthed(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) },
    { tries: 2, timeoutMs: 20_000 },
  );
  if (!res.ok) throw new Error(`העברת קובץ לפח נכשלה (${res.status})`);
}

export async function listBackups(): Promise<{ id: string; name: string; at: Date }[]> {
  const folder = await getBackupFolderId();
  const kids = await driveListChildren(folder);
  return kids
    .map((k) => ({ id: k.id, name: k.name, at: parseBackupName(k.name) }))
    .filter((k): k is { id: string; name: string; at: Date } => k.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

async function audit(action: string, details: unknown) {
  try {
    await db.insert(auditLogs).values({ action, entityType: "db_backup", details: JSON.stringify(details).slice(0, 2000) });
  } catch (e) {
    console.error("[db-backup] audit insert failed", e instanceof Error ? e.message : e);
  }
}

export async function runDbBackup(opts: { force?: boolean; notify?: Notify; trigger?: string } = {}): Promise<BackupOutcome> {
  const now = new Date();
  const force = opts.force === true;
  if (!force && !(await isEnabled())) return { status: "skipped", reason: "הגיבוי כבוי (settings.db_backup_enabled=false)" };
  const state = await readState();
  if (!isBackupDue(state, now, force)) return { status: "skipped", reason: `יש גיבוי מהשעות האחרונות (${state.lastOkName ?? "?"})` };
  if (!(await claim(state, now, force))) return { status: "skipped", reason: "ריצה אחרת פעילה (נעילה)" };

  const t0 = Date.now();
  try {
    const url = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "");
    if (!url) throw new Error("DATABASE_URL לא מוגדר");
    const dump = await dumpDatabase(await neonQueryFn(url));
    const name = backupFileName(now);
    const folder = await getBackupFolderId();
    const up = await driveUploadRest({
      name,
      mimeType: "application/gzip",
      bytes: new Uint8Array(dump.gz),
      parentId: folder,
      appProperties: { dbBackup: "1", rows: String(dump.totalRows), tables: String(dump.tables.length) },
    });
    if (up.size !== dump.gz.length) throw new Error(`גודל הקובץ בדרייב (${up.size}) שונה מהמקור (${dump.gz.length})`);

    // שימור: רק אחרי שההעלאה אומתה. לא מוחקים אם יש פחות מ-3 גיבויים. לפח, לא מחיקה סופית.
    const removed: string[] = [];
    try {
      const all = await listBackups();
      if (all.length >= 3) {
        const { remove } = selectRetention(all.map((b) => b.name));
        for (const n of remove) {
          const f = all.find((b) => b.name === n);
          if (f && f.id !== up.fileId) {
            await trashFile(f.id);
            removed.push(n);
          }
        }
      }
    } catch (e) {
      console.error("[db-backup] retention failed (הגיבוי עצמו הצליח):", e instanceof Error ? e.message : e);
    }

    const next: BackupState = {
      ...state,
      lastOkAt: now.toISOString(),
      lastOkName: name,
      lastOkFileId: up.fileId,
      lastOkBytes: dump.gz.length,
      lastOkRows: dump.totalRows,
      lastOkTables: dump.tables.length,
      lastAttemptAt: now.toISOString(),
      lastError: null,
      consecutiveFailures: 0,
    };
    await writeState(next);
    const ms = Date.now() - t0;
    await audit("db_backup", { ok: true, name, bytes: dump.gz.length, tables: dump.tables.length, rows: dump.totalRows, removed: removed.length, ms, trigger: opts.trigger ?? "cron" });
    return { status: "ok", name, fileId: up.fileId, bytes: dump.gz.length, tables: dump.tables.length, rows: dump.totalRows, removed, ms };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    const failed: BackupState = { ...state, lastAttemptAt: now.toISOString(), lastError: error, consecutiveFailures: state.consecutiveFailures + 1 };
    let alerted = false;
    if (opts.notify && shouldAlert(failed, now)) {
      try {
        await opts.notify(
          "⚠️ גיבוי מסד הנתונים של האתר נכשל",
          `גיבוי מסד הנתונים (Neon → דרייב) נכשל ${failed.consecutiveFailures} פעמים ברצף.\nהשגיאה האחרונה: ${error}\nהגיבוי המוצלח האחרון: ${failed.lastOkAt ?? "אין"}${failed.lastOkName ? ` (${failed.lastOkName})` : ""}\n\nהמערכת תנסה שוב בעוד כמה שעות. פירוט: docs/db-backup.md.`,
        );
        failed.lastAlertAt = now.toISOString();
        alerted = true;
      } catch (ne) {
        console.error("[db-backup] alert mail failed:", ne instanceof Error ? ne.message : ne);
      }
    }
    try {
      await writeState(failed);
    } catch (we) {
      console.error("[db-backup] could not record failure:", we instanceof Error ? we.message : we);
    }
    await audit("db_backup", { ok: false, error, failures: failed.consecutiveFailures, trigger: opts.trigger ?? "cron" });
    return { status: "failed", error, consecutiveFailures: failed.consecutiveFailures, alerted };
  }
}
