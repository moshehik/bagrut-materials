/**
 * "גרסה פרטית מתוקנת" של חומר למורה אחת (טבלת material_private_versions) – קריאה למסלולי ההגשה ולכרטיסייה,
 * וכתיבה (העלאה לדרייב + שורה) לסקריפט הסוכן scripts/agent-general-fix.ts ולפעולת המחיקה של המנהלת.
 *
 * מאיפה זה מגיע: מורה שולחת "הערה כללית על הקובץ" (material_fixes, kind=general). הסוכן קורא את הקובץ החי,
 * עורך docx מתוקן, ומחליט: לכל המורות (replaceDocxInPlace – הקובץ המשותף מוחלף, עם גיבוי) או רק לה
 * (publishPrivateVersion כאן – קובץ נפרד בדרייב, בתיקיית הארכיון, שמוגש לה בלבד במקום המשותף).
 * ההגשה: /api/preview, /api/download (גם שליחה למייל) ו-/api/download-folder קוראים resolveServedFile ומקבלים את
 * הקובץ הפרטי שלה, שעובר את אותו צינור בדיוק (תיקוני-הגשה, המרה ב-Oracle, הטבעת מספר אישי, תיקונים מסומנים).
 * בלי "server-only" בכוונה: הסקריפט (tsx) מייבא ישירות. לוגיקה טהורה – private-version-logic.ts.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes, materialPrivateVersions, materials, users } from "@/db/schema";
import { driveFetchAuthed, driveIdFromUrl } from "@/lib/driveBridgeCore";
import { driveCreateFolder, driveGet, drivePatch, ensureArchiveFolders } from "@/lib/driveTreeCore";
import { logFixEvent } from "@/lib/fix-events";
import { ilStamp } from "@/lib/agentFileReplace";
import {
  GENERAL_VISIBLE_STATUSES,
  chooseServedFile,
  isDriveUrlStrict,
  parseOriginalParam,
  privateVersionDriveName,
  type CorrectionState,
  type PrivateVersionInfo,
} from "@/lib/private-version-logic";

export const PRIVATE_VERSIONS_FOLDER_NAME = "גרסאות פרטיות (תיקון למורה אחת)";
/** תת-תיקייה לגרסאות שהוחלפו/הוסרו – הקבצים נשארים לתמיד (לא מוחקים ולא מעבירים לאשפה) */
export const INACTIVE_VERSIONS_FOLDER_NAME = "לא פעילות (הוחלפו או הוסרו)";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

type MaterialRow = typeof materials.$inferSelect;

function toInfo(r: typeof materialPrivateVersions.$inferSelect): PrivateVersionInfo {
  return { id: r.id, fileUrl: r.fileUrl, fileName: r.fileName, note: r.note, createdAt: r.createdAt, fixId: r.fixId };
}

/* ------------------------------ קריאה ------------------------------ */

/** הגרסה הפרטית הפעילה של המשתמשת לחומר (null אם אין / שגיאת DB – לא מפילה הגשה) */
export async function getPrivateVersion(materialId: number, userId: number | null | undefined): Promise<PrivateVersionInfo | null> {
  if (!userId) return null;
  try {
    const [r] = await db
      .select()
      .from(materialPrivateVersions)
      .where(and(eq(materialPrivateVersions.materialId, materialId), eq(materialPrivateVersions.userId, userId), eq(materialPrivateVersions.status, "active")))
      .orderBy(desc(materialPrivateVersions.id))
      .limit(1);
    return r ? toInfo(r) : null;
  } catch (e) {
    console.error("getPrivateVersion failed", e);
    return null;
  }
}

/** לכל חומר בדף התיקייה: הגרסה הפרטית של המבקרת + מצב התלונות הכלליות שלה (לכרטיסייה). שגיאת DB = מפה ריקה. */
export async function getCorrectionStateForViewer(materialIds: number[], userId: number | null | undefined): Promise<Map<number, CorrectionState>> {
  const out = new Map<number, CorrectionState>();
  if (!userId || materialIds.length === 0) return out;
  try {
    const [versions, complaints] = await Promise.all([
      db
        .select()
        .from(materialPrivateVersions)
        .where(and(inArray(materialPrivateVersions.materialId, materialIds), eq(materialPrivateVersions.userId, userId), eq(materialPrivateVersions.status, "active"))),
      db
        .select({
          id: materialFixes.id,
          materialId: materialFixes.materialId,
          status: materialFixes.status,
          replyText: materialFixes.replyText,
          createdAt: materialFixes.createdAt,
        })
        .from(materialFixes)
        .where(
          and(
            inArray(materialFixes.materialId, materialIds),
            eq(materialFixes.userId, userId),
            eq(materialFixes.kind, "general"),
            inArray(materialFixes.status, [...GENERAL_VISIBLE_STATUSES]),
          ),
        ),
    ]);
    const get = (id: number) => {
      const s = out.get(id) ?? { privateVersion: null, general: [] };
      out.set(id, s);
      return s;
    };
    for (const v of versions) {
      const s = get(v.materialId);
      if (!s.privateVersion || s.privateVersion.id < v.id) s.privateVersion = toInfo(v);
    }
    for (const c of complaints) get(c.materialId).general.push({ id: c.id, status: c.status, replyText: c.replyText, createdAt: c.createdAt });
  } catch (e) {
    console.error("getCorrectionStateForViewer failed", e);
  }
  return out;
}

/**
 * הקובץ שמסלול הגשה צריך להביא עבור המשתמשת: הגרסה הפרטית שלה (אם יש, ולא ביקשה ?original=1), אחרת הקובץ המשותף.
 * מנהלת: המשותף, אלא אם ביקשה ?pv=<id> (גרסה פרטית של החומר הזה – לבדיקה). מחזיר גם את fileId למטמון ה-PDF
 * (הגרסה הפרטית מקבלת מפתח מטמון משלה – לעולם לא PDF של תוכן אחר).
 */
export async function resolveServedFile(
  material: MaterialRow,
  user: { id: number; role: string } | null | undefined,
  searchParams: URLSearchParams,
): Promise<{ fileUrl: string; fileName: string; privateVersion: PrivateVersionInfo | null; cacheFileId: string | null }> {
  const shared = { fileUrl: material.fileUrl, fileName: material.fileName, privateVersion: null, cacheFileId: driveIdFromUrl(material.fileUrl) };
  if (!user) return shared;
  let pv: PrivateVersionInfo | null = null;
  const pvId = Number(searchParams.get("pv"));
  if (user.role === "admin" && Number.isInteger(pvId) && pvId > 0) {
    // מנהלת יכולה לצפות בכל גרסה פרטית לפי מזהה (?pv=)
    pv = await getPrivateVersionById(pvId, material.id);
  } else {
    // כולן, גם מנהלת שהיא עצמה המבקשת: הגרסה הפרטית של עצמה (כמו שכתוב בכרטיס "הקובץ תוקן עבורך"); ?original=1 = המשותף
    pv = await getPrivateVersion(material.id, user.id);
  }
  const chosen = chooseServedFile({ material, privateVersion: pv, wantOriginal: parseOriginalParam(searchParams.get("original")) });
  return { ...chosen, cacheFileId: driveIdFromUrl(chosen.fileUrl) };
}

/** גרסה פרטית לפי מזהה (רק אם שייכת לחומר הנתון ופעילה) – למנהלת */
export async function getPrivateVersionById(id: number, materialId?: number): Promise<PrivateVersionInfo | null> {
  try {
    const [r] = await db.select().from(materialPrivateVersions).where(eq(materialPrivateVersions.id, id)).limit(1);
    if (!r || r.status !== "active") return null;
    if (materialId != null && r.materialId !== materialId) return null;
    return toInfo(r);
  } catch (e) {
    console.error("getPrivateVersionById failed", e);
    return null;
  }
}

/** כל הגרסאות הפרטיות הפעילות (למנהלת ב-/admin/fixes) */
export async function listActivePrivateVersions() {
  return db
    .select({
      id: materialPrivateVersions.id,
      materialId: materialPrivateVersions.materialId,
      materialTitle: materials.title,
      fileName: materialPrivateVersions.fileName,
      note: materialPrivateVersions.note,
      createdAt: materialPrivateVersions.createdAt,
      fixId: materialPrivateVersions.fixId,
      userId: materialPrivateVersions.userId,
      userName: users.name,
      size: materialPrivateVersions.size,
    })
    .from(materialPrivateVersions)
    .innerJoin(materials, eq(materials.id, materialPrivateVersions.materialId))
    .leftJoin(users, eq(users.id, materialPrivateVersions.userId))
    .where(eq(materialPrivateVersions.status, "active"))
    .orderBy(desc(materialPrivateVersions.createdAt));
}

/* ------------------------------ כתיבה ------------------------------ */

let folderCache: string | null = null;
/** תיקיית הגרסאות הפרטיות תחת _ארכיון (נוצרת לפי הצורך). בארכיון בכוונה – סנכרון הדרייב לא מאמץ משם קבצים כחומרים. */
export async function ensurePrivateVersionsFolder(): Promise<string> {
  if (folderCache) return folderCache;
  const archive = await ensureArchiveFolders();
  folderCache = await driveCreateFolder(PRIVATE_VERSIONS_FOLDER_NAME, archive.root);
  return folderCache;
}

let inactiveCache: string | null = null;
export async function ensureInactiveVersionsFolder(): Promise<string> {
  if (inactiveCache) return inactiveCache;
  inactiveCache = await driveCreateFolder(INACTIVE_VERSIONS_FOLDER_NAME, await ensurePrivateVersionsFolder());
  return inactiveCache;
}

/**
 * גרסה שיצאה משימוש: הקובץ **נשאר** בדרייב – מועבר לתת-תיקיית "לא פעילות" ומקבל שם מתאר (למה ומתי). כשל בהעברה לא
 * מפיל את הפעולה (השורה כבר סומנה) – נרשם ביומן.
 */
async function parkInactiveFile(fileUrl: string, why: "replaced" | "removed", reason: string): Promise<{ fileId: string | null; moved: boolean; newName?: string }> {
  const fileId = driveIdFromUrl(fileUrl);
  if (!fileId) return { fileId: null, moved: false };
  try {
    const cur = await driveGet(fileId);
    if (!cur) return { fileId, moved: false };
    const target = await ensureInactiveVersionsFolder();
    const label = why === "replaced" ? "הוחלפה בגרסה חדשה" : "הוסרה";
    const newName = `${cur.name.replace(/\.docx$/i, "")} [${label} ${ilStamp()}].docx`;
    await drivePatch(fileId, {
      name: newName,
      description: `${cur.description ?? ""}\n${label} ב-${ilStamp()}: ${reason.slice(0, 300)}\nנשמר לתמיד (לא נמחק).`,
      addParent: target,
      removeParents: cur.parents.filter((p) => p !== target),
    });
    return { fileId, moved: true, newName };
  } catch (e) {
    console.warn("private version: parking inactive file failed (file left where it is)", e instanceof Error ? e.message : e);
    return { fileId, moved: false };
  }
}

/** העלאת קובץ חדש לתיקייה בדרייב (multipart; tries=1 – ניסיון חוזר אחרי תשובה שאבדה היה מכפיל את הקובץ) */
export async function uploadFileToFolder(opts: { folderId: string; name: string; bytes: Uint8Array | Buffer; description: string; appProperties: Record<string, string>; mimeType?: string }) {
  const mime = opts.mimeType ?? DOCX_MIME;
  const boundary = `pv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: opts.name, mimeType: mime, parents: [opts.folderId], description: opts.description, appProperties: opts.appProperties });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, "utf-8"),
    Buffer.from(opts.bytes),
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
  ]);
  const up = await driveFetchAuthed(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,size`,
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    { tries: 1, timeoutMs: 90_000 },
  );
  if (!up.ok) throw new Error(`העלאת הגרסה הפרטית לדרייב נכשלה (${up.status}): ${(await up.text()).slice(0, 200)}`);
  const j = (await up.json()) as { id: string; size?: string };
  return { fileId: j.id, size: j.size ? Number(j.size) : opts.bytes.length };
}

export type PublishPrivateResult = { versionId: number; fileId: string; driveName: string; replacedVersionId: number | null };

/**
 * מפרסם docx מתוקן כגרסה פרטית של המשתמשת לחומר: מעלה לדרייב (תיקיית הארכיון, לא תיקיית הקטגוריה), מכניס שורה,
 * ומסמן גרסה פרטית קודמת של אותו זוג כ-replaced (הקובץ הקודם נשאר – מועבר ל"לא פעילות" עם שם מתאר). הקובץ המשותף
 * לא נוגעים בו. האימות של ה-docx (checkEditedDocx) הוא באחריות הקורא – כאן רק בדיקת שפיות על הגודל.
 */
export async function publishPrivateVersion(opts: {
  material: MaterialRow;
  userId: number;
  fixId: number;
  bytes: Uint8Array | Buffer;
  /** מה שונה – מוצג למורה */
  note: string;
  via?: string;
  actorId?: number | null;
  ip?: string | null;
}): Promise<PublishPrivateResult> {
  const { material, userId, fixId, bytes, note } = opts;
  if (bytes.length < 2000) throw new Error("הקובץ קטן מדי – לא נראה docx תקין");
  const folderId = await ensurePrivateVersionsFolder();
  const driveName = privateVersionDriveName(material.fileName, userId, fixId);
  const { fileId, size } = await uploadFileToFolder({
    folderId,
    name: driveName,
    bytes,
    description: `גרסה פרטית של חומר #${material.id} "${material.fileName}" למשתמשת #${userId}, בעקבות הערה כללית #${fixId}.\nמוגשת רק לה (ר' material_private_versions). ${note.slice(0, 300)}`,
    appProperties: { privateVersionOf: String(material.id), forUser: String(userId), fixId: String(fixId), archived: "1", archiveKind: "privateVersion" },
  });
  const fileUrl = `drive://${fileId}`;
  if (!isDriveUrlStrict(fileUrl)) throw new Error(`מזהה דרייב לא צפוי: ${fileId}`);

  // גרסה קודמת של אותו זוג: מסומנת replaced; הקובץ שלה נשאר בדרייב (תת-תיקיית "לא פעילות", שם מתאר) – לא מוחקים
  const previous = await db
    .select()
    .from(materialPrivateVersions)
    .where(and(eq(materialPrivateVersions.materialId, material.id), eq(materialPrivateVersions.userId, userId), eq(materialPrivateVersions.status, "active")));
  const [row] = await db
    .insert(materialPrivateVersions)
    .values({ materialId: material.id, userId, fixId, fileUrl, fileName: material.fileName, size, note, status: "active" })
    .returning({ id: materialPrivateVersions.id });
  let replacedVersionId: number | null = null;
  const parked: unknown[] = [];
  for (const p of previous) {
    await db.update(materialPrivateVersions).set({ status: "replaced", removedAt: new Date() }).where(eq(materialPrivateVersions.id, p.id));
    replacedVersionId = p.id;
    parked.push({ versionId: p.id, ...(await parkInactiveFile(p.fileUrl, "replaced", `הוחלפה בגרסה #${row.id} (הערה #${fixId})`)) });
  }
  await logFixEvent({
    fixId,
    materialId: material.id,
    action: "fix.general.private.published",
    actorId: opts.actorId ?? null,
    ip: opts.ip ?? null,
    summary: `גרסה פרטית #${row.id} פורסמה למשתמשת #${userId} (דרייב ${fileId}, "${driveName}")`,
    details: { versionId: row.id, fileId, driveName, userId, size, note, via: opts.via ?? "agent-general-fix", replacedVersionId, parkedPrevious: parked },
  });
  return { versionId: row.id, fileId, driveName, replacedVersionId };
}

/**
 * הסרת גרסה פרטית (המנהלת / הסוכן): השורה מסומנת removed (לא נמחקת) והקובץ **נשאר** בדרייב (מועבר ל"לא פעילות" עם שם
 * מתאר). המורה חוזרת לקובץ המשותף.
 */
export async function removePrivateVersion(
  id: number,
  opts: { reason: string; actorId?: number | null; source?: "admin" | "claude"; ip?: string | null } = { reason: "" },
): Promise<boolean> {
  const [r] = await db.select().from(materialPrivateVersions).where(eq(materialPrivateVersions.id, id)).limit(1);
  if (!r || r.status !== "active") return false;
  await db.update(materialPrivateVersions).set({ status: "removed", removedAt: new Date() }).where(eq(materialPrivateVersions.id, id));
  const parked = await parkInactiveFile(r.fileUrl, "removed", opts.reason);
  await logFixEvent({
    fixId: r.fixId ?? 0,
    materialId: r.materialId,
    action: "fix.general.private.removed",
    actorId: opts.actorId ?? null,
    source: opts.source ?? "claude",
    ip: opts.ip ?? null,
    summary: `גרסה פרטית #${id} של משתמשת #${r.userId} הוסרה (הקובץ נשמר בדרייב${parked.moved ? `, הועבר ל"לא פעילות"` : ""})`,
    details: { versionId: id, userId: r.userId, reason: opts.reason, ...parked },
  });
  return true;
}
