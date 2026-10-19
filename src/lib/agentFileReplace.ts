/**
 * החלפת קובץ docx חי של חומר *במקום* (אותו fileId, אותה שורת materials), תמיד עם גיבוי של הגרסה הקודמת.
 * משותף ל-scripts/agent-edit-file.ts (עריכה ידנית של הסוכן) ול-scripts/agent-fix-suggest.ts (--merge: שילוב תיקון
 * שהסוכן החליט שהוא נכון). אין כאן "server-only" – רץ גם כסקריפט tsx.
 */
import JSZip from "jszip";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { materials } from "@/db/schema";
import {
  ARCHIVE_SUB,
  buildFileDescription,
  driveApi,
  driveGet,
  drivePatch,
  ensureArchiveFolders,
  logDriveEvent,
  sanitizeDriveName,
} from "@/lib/driveTreeCore";
import { logAgentEvent } from "@/lib/agentEvents";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** "05.10.2026" לפי שעון ישראל */
export function ilDate(d = new Date()) {
  const p = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("day")}.${g("month")}.${g("year")}`;
}
export function ilStamp(d = new Date()) {
  const t = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(":", "-");
  return `${ilDate(d)} ${t}`;
}

/** שם עם תוספת " (נערך DD.MM.YYYY)" לפני הסיומת; מחליף תוספת קודמת במקום לערום. */
export function withEditDate(fileName: string, date = ilDate()): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot) : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/\s*\(נערך \d{2}\.\d{2}\.\d{4}\)\s*$/, "");
  return `${base} (נערך ${date})${ext}`;
}

/** docx תקין ולא קטן/ריק בחשד (זורק שגיאה אחרת) */
export async function assertValidDocx(bytes: Uint8Array | Buffer) {
  if (bytes.length < 2000) throw new Error(`הקובץ הערוך קטן מדי (${bytes.length} בתים) — כנראה שגוי`);
  const zip = await JSZip.loadAsync(bytes);
  // חלק מקובצי ה-docx החיים נבנו עם נתיבי zip עם backslash ("word\document.xml") — האתר מנרמל אותם בזמן ההגשה
  // (ר' normalizeDocxZipPaths ב-driveBridgeCore), לכן מקבלים את שתי הצורות
  const names = Object.keys(zip.files).map((n) => n.split(String.fromCharCode(92)).join("/"));
  if (!names.includes("word/document.xml")) throw new Error("הקובץ הערוך אינו docx תקין (חסר word/document.xml)");
}

type MaterialRow = typeof materials.$inferSelect;

export type ReplaceResult = { newName: string; backupId: string; backupName: string; oldSize: number | null; newSize: number };

/** שם הגיבוי בדרייב והשם החדש – לתצוגה מקדימה, בלי לכתוב כלום */
export async function planReplace(opts: { m: MaterialRow; fileId: string; keepName?: boolean }) {
  const cur = await driveGet(opts.fileId);
  if (!cur) throw new Error("הקובץ הנוכחי לא נמצא בדרייב");
  const newName = opts.keepName ? opts.m.fileName : withEditDate(opts.m.fileName);
  const backupName = sanitizeDriveName(`${cur.name.replace(/\.docx$/i, "")} (גרסה לפני עריכה ${ilStamp()}).docx`);
  return { cur, newName, backupName };
}

/**
 * 1. גיבוי (העתקה בצד השרת של גוגל ל-_ארכיון/גרסאות ישנות – בלי גיבוי לא מחליפים)
 * 2. החלפת תוכן במקום (PATCH על אותו fileId)
 * 3. שם + תיאור (השם הישן נשמר בתיאור ובהיסטוריה), עדכון גודל ב-DB
 * 4. רישום ביומן הדרייב וביומן הסוכן
 */
export async function replaceDocxInPlace(opts: {
  m: MaterialRow;
  fileId: string;
  bytes: Uint8Array | Buffer;
  note: string;
  keepName?: boolean;
  via?: string;
}): Promise<ReplaceResult> {
  const { m, fileId, bytes, note } = opts;
  await assertValidDocx(bytes);
  const { cur, newName, backupName } = await planReplace({ m, fileId, keepName: opts.keepName });

  const archive = await ensureArchiveFolders();
  const copyRes = await driveApi(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: backupName,
      parents: [archive.sub.oldVersions],
      description: `גיבוי אוטומטי לפני עריכה (${ilStamp()}) של חומר #${m.id}\nהועבר לארכיון: גרסה לפני עריכה — ${note.slice(0, 300)}`,
      appProperties: { archived: "1", archiveKind: "oldVersions", backupOf: String(m.id) },
    }),
  });
  if (!copyRes.ok) throw new Error(`יצירת הגיבוי נכשלה (${copyRes.status}) — לא מחליפים בלי גיבוי`);
  const backupId = ((await copyRes.json()) as { id: string }).id;

  const up = await driveApi(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,size`, {
    method: "PATCH",
    headers: { "Content-Type": DOCX_MIME },
    body: bytes as BodyInit,
  });
  if (!up.ok) throw new Error(`החלפת התוכן נכשלה (${up.status}): ${(await up.text()).slice(0, 200)} — הגיבוי נשמר (${backupId})`);

  const original = m.driveOriginalName ?? cur.name;
  await drivePatch(fileId, {
    name: newName,
    description: `${buildFileDescription({ originalName: original, materialId: m.id })}\nנערך ב-${ilDate()} ע"י הסוכן האוטומטי: ${note.slice(0, 500)}\nגיבוי הגרסה הקודמת: ${backupId}`,
  });
  await db.update(materials).set({ fileName: newName, size: bytes.length }).where(eq(materials.id, m.id));

  await logDriveEvent({
    kind: "file.edit",
    materialId: m.id,
    categoryId: m.categoryId,
    driveId: fileId,
    oldValue: m.fileName,
    newValue: newName,
    details: { note, backupId, oldSize: cur.size, newSize: bytes.length, via: opts.via },
  });
  if (newName !== m.fileName) {
    await logDriveEvent({ kind: "file.rename", materialId: m.id, categoryId: m.categoryId, driveId: fileId, oldValue: m.fileName, newValue: newName, details: { via: opts.via ?? "agent-edit" } });
  }
  await logAgentEvent({ source: "claude", kind: "fix", summary: `עריכת קובץ #${m.id}: "${m.fileName}" → "${newName}" (גיבוי ${backupId})`, details: { note } });
  return { newName, backupId, backupName, oldSize: cur.size ?? null, newSize: bytes.length };
}

export { ARCHIVE_SUB };
