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

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { materials } from "../src/db/schema";
import { driveDownload, driveIdFromUrl } from "../src/lib/driveBridgeCore";
import { ARCHIVE_SUB, categoryPathNames, driveGet, loadCategories } from "../src/lib/driveTreeCore";
import { logAgentEvent } from "../src/lib/agentEvents";
import { assertValidDocx, planReplace, replaceDocxInPlace, withEditDate } from "../src/lib/agentFileReplace";

const args = process.argv.slice(2);
const val = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const flag = (n: string) => args.includes(`--${n}`);

// ההחלפה עצמה (גיבוי → PATCH → שם/תיאור → יומנים) יושבת ב-src/lib/agentFileReplace.ts, משותפת עם agent-fix-suggest --merge
export { withEditDate };

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

  await assertValidDocx(bytes);
  const keepName = flag("no-date-in-name");
  const { cur, newName, backupName } = await planReplace({ m, fileId, keepName });

  console.log(
    JSON.stringify({ mode: flag("confirm") ? "APPLY" : "PREVIEW", materialId: id, current: m.fileName, newName, backupName, oldSize: cur.size, newSize: bytes.length, note }, null, 2),
  );
  if (!flag("confirm")) {
    console.log("תצוגה מקדימה בלבד. להחלה בפועל (רק אחרי אישור מפורש של משה): הוסיפו --confirm");
    return;
  }

  const r = await replaceDocxInPlace({ m, fileId, bytes, note, keepName, via: "agent-edit" });
  console.log(`OK: הוחלף במקום. שם חדש: ${r.newName} · גיבוי: ${r.backupId} (בארכיון/${ARCHIVE_SUB.oldVersions})`);
}

(flag("get") ? get() : flag("put") ? put() : Promise.reject(new Error("שימוש: --get <materialId> | --put <materialId> <file> --note ..."))).catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
