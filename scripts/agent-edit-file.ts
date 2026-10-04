/**
 * כלי הסוכן לעריכת קובץ חי באתר: למשוך את הקובץ מהדרייב לעריכה, ולשמור את הגרסה הערוכה חזרה
 * *באותו מקום* (אותו fileId, אותה תיקיית קטגוריה, אותה שורת materials) עם תוספת תאריך עריכה לשם.
 *
 *   npx tsx scripts/agent-edit-file.ts --get <materialId> [--out <dir>]
 *       מדפיס JSON (חומר, נתיב הקטגוריה, תיקיית דרייב, fileId) ומוריד את הקובץ ל-<dir>/original.docx
 *       (ברירת מחדל: _agent_work/<materialId>/). זה המקור היחיד לעריכה — לא מחפשים קבצים בדיסק המקומי.
 *   npx tsx scripts/agent-edit-file.ts --put <materialId> <editedFile> --note "<מה תוקן>" [--confirm] [--no-date-in-name]
 *       בלי --confirm: תצוגה מקדימה בלבד (לא כותב כלום). עם --confirm (רק אחרי אישור מפורש של משה):
 *         1. גיבוי: העתקת הגרסה הנוכחית ל-_ארכיון/גרסאות ישנות בשם "<שם> (גרסה לפני עריכה <תאריך שעה>).docx"
 *         2. החלפת התוכן במקום (PATCH על אותו fileId — שורת ה-DB נשארת תקפה, אין חומר כפול)
 *         3. שם הקובץ מקבל תוספת " (נערך DD.MM.YYYY)" לפני הסיומת (עריכה חוזרת מחליפה את התאריך, לא מצטברת);
 *            materials.fileName והשם בדרייב מתעדכנים יחד; השם הישן נשאר בהיסטוריה (drive_events) ובתיאור הקובץ
 *         4. עדכון גודל ב-DB, רישום ביומן הדרייב וביומן הסוכן
 *       --no-date-in-name: אותו תהליך בלי לשנות את השם (התאריך נשאר בתיאור/היסטוריה בלבד).
 * מוודא שהקובץ הערוך הוא docx תקין (zip עם word/document.xml) ולא ריק/קטן בחשד. דורש DATABASE_URL + DRIVE_BRIDGE_*.
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
dotenv.config({ path: ".env.local" });

import JSZip from "jszip";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { materials } from "../src/db/schema";
import { driveDownload, driveIdFromUrl } from "../src/lib/driveBridgeCore";
import {
  ARCHIVE_SUB,
  buildFileDescription,
  categoryPathNames,
  driveApi,
  driveGet,
  drivePatch,
  ensureArchiveFolders,
  loadCategories,
  logDriveEvent,
  sanitizeDriveName,
} from "../src/lib/driveTreeCore";
import { logAgentEvent } from "../src/lib/agentEvents";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const args = process.argv.slice(2);
const val = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const flag = (n: string) => args.includes(`--${n}`);

/** "05.10.2026" לפי שעון ישראל */
function ilDate(d = new Date()) {
  const p = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("day")}.${g("month")}.${g("year")}`;
}
function ilStamp(d = new Date()) {
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

async function loadMaterial(id: number) {
  const [m] = await db.select().from(materials).where(eq(materials.id, id));
  if (!m) throw new Error(`חומר ${id} לא נמצא`);
  const fileId = driveIdFromUrl(m.fileUrl);
  if (!fileId) throw new Error(`לחומר ${id} אין קובץ דרייב (fileUrl=${m.fileUrl.slice(0, 30)}…) — אי אפשר לערוך`);
  return { m, fileId };
}

async function get() {
  const id = Number(val("get"));
  const { m, fileId } = await loadMaterial(id);
  const { byId } = await loadCategories();
  const cat = byId.get(m.categoryId);
  const f = await driveGet(fileId);
  if (!f) throw new Error("הקובץ לא נמצא בדרייב");
  const out = path.resolve(val("out") ?? path.join("_agent_work", String(id)));
  fs.mkdirSync(out, { recursive: true });
  const dl = await driveDownload(fileId);
  fs.writeFileSync(path.join(out, "original.docx"), Buffer.from(dl.bytes));
  await logAgentEvent({ source: "claude", kind: "cli", summary: `agent-edit-file --get #${id} "${m.fileName}" (${dl.size} bytes)` });
  console.log(
    JSON.stringify(
      {
        materialId: m.id,
        title: m.title,
        fileName: m.fileName,
        driveName: f.name,
        status: m.status,
        category: cat ? categoryPathNames(cat.id, byId).join(" / ") : null,
        driveFolderUrl: cat?.driveFolderId ? `https://drive.google.com/drive/folders/${cat.driveFolderId}` : null,
        fileId,
        size: dl.size,
        modified: f.modifiedTime,
        savedTo: path.join(out, "original.docx"),
      },
      null,
      2,
    ),
  );
}

async function put() {
  const id = Number(val("put"));
  const file = args[args.indexOf("--put") + 2];
  const note = val("note") ?? "";
  if (!id || !file || !fs.existsSync(file)) throw new Error("שימוש: --put <materialId> <editedFile.docx> --note \"...\" [--confirm]");
  if (!note) throw new Error('חובה --note "מה תוקן" (נכנס לתיאור הקובץ ולהיסטוריה)');
  const { m, fileId } = await loadMaterial(id);
  const bytes = fs.readFileSync(file);

  // אימות בסיסי: docx תקין ולא קטן/ריק בחשד
  if (bytes.length < 2000) throw new Error(`הקובץ הערוך קטן מדי (${bytes.length} בתים) — כנראה שגוי`);
  const zip = await JSZip.loadAsync(bytes);
  // חלק מקובצי ה-docx החיים נבנו עם נתיבי zip עם backslash ("word\document.xml") — האתר מנרמל אותם בזמן ההגשה
  // (ר' normalizeDocxZipPaths ב-driveBridgeCore), לכן מקבלים את שתי הצורות
  const names = Object.keys(zip.files).map((n) => n.split(String.fromCharCode(92)).join("/"));
  if (!names.includes("word/document.xml")) throw new Error("הקובץ הערוך אינו docx תקין (חסר word/document.xml)");
  const cur = await driveGet(fileId);
  if (!cur) throw new Error("הקובץ הנוכחי לא נמצא בדרייב");
  const newName = flag("no-date-in-name") ? m.fileName : withEditDate(m.fileName);
  const backupName = sanitizeDriveName(`${cur.name.replace(/\.docx$/i, "")} (גרסה לפני עריכה ${ilStamp()}).docx`);

  console.log(
    JSON.stringify({ mode: flag("confirm") ? "APPLY" : "PREVIEW", materialId: id, current: m.fileName, newName, backupName, oldSize: cur.size, newSize: bytes.length, note }, null, 2),
  );
  if (!flag("confirm")) {
    console.log("תצוגה מקדימה בלבד. להחלה בפועל (רק אחרי אישור מפורש של משה): הוסיפו --confirm");
    return;
  }

  // 1. גיבוי — העתקה בצד השרת של גוגל לארכיון/גרסאות ישנות
  const archive = await ensureArchiveFolders();
  const copyRes = await driveApi(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: backupName,
      parents: [archive.sub.oldVersions],
      description: `גיבוי אוטומטי לפני עריכה (${ilStamp()}) של חומר #${id}\nהועבר לארכיון: גרסה לפני עריכה — ${note.slice(0, 300)}`,
      appProperties: { archived: "1", archiveKind: "oldVersions", backupOf: String(id) },
    }),
  });
  if (!copyRes.ok) throw new Error(`יצירת הגיבוי נכשלה (${copyRes.status}) — לא מחליפים בלי גיבוי`);
  const backupId = ((await copyRes.json()) as { id: string }).id;

  // 2. החלפת תוכן במקום (אותו fileId)
  const up = await driveApi(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,size`, {
    method: "PATCH",
    headers: { "Content-Type": DOCX_MIME },
    body: bytes,
  });
  if (!up.ok) throw new Error(`החלפת התוכן נכשלה (${up.status}): ${(await up.text()).slice(0, 200)} — הגיבוי נשמר (${backupId})`);

  // 3. שם + תיאור (השם הישן נשמר בתיאור ובהיסטוריה)
  const original = m.driveOriginalName ?? cur.name;
  await drivePatch(fileId, {
    name: newName,
    description: `${buildFileDescription({ originalName: original, materialId: m.id })}\nנערך ב-${ilDate()} ע"י הסוכן האוטומטי: ${note.slice(0, 500)}\nגיבוי הגרסה הקודמת: ${backupId}`,
  });
  await db.update(materials).set({ fileName: newName, size: bytes.length }).where(eq(materials.id, id));

  // 4. היסטוריה ויומנים
  await logDriveEvent({ kind: "file.edit", materialId: id, categoryId: m.categoryId, driveId: fileId, oldValue: m.fileName, newValue: newName, details: { note, backupId, oldSize: cur.size, newSize: bytes.length } });
  if (newName !== m.fileName) await logDriveEvent({ kind: "file.rename", materialId: id, categoryId: m.categoryId, driveId: fileId, oldValue: m.fileName, newValue: newName, details: { via: "agent-edit" } });
  await logAgentEvent({ source: "claude", kind: "fix", summary: `עריכת קובץ #${id}: "${m.fileName}" → "${newName}" (גיבוי ${backupId})`, details: { note } });
  console.log(`OK: הוחלף במקום. שם חדש: ${newName} · גיבוי: ${backupId} (בארכיון/${ARCHIVE_SUB.oldVersions})`);
}

(flag("get") ? get() : flag("put") ? put() : Promise.reject(new Error("שימוש: --get <materialId> | --put <materialId> <file> --note ..."))).catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
