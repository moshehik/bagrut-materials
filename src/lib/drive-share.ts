import "server-only";
import { and, asc, count, eq, like, lt, notLike, sql } from "drizzle-orm";
import { db } from "@/db";
import { videoShareShards, videoShares } from "@/db/schema";
import { driveCopyFile, driveFetchAuthed, getRootFolderId, SHARE_COPIES_FOLDER_NAME } from "@/lib/driveBridgeCore";
import { getNumber } from "@/lib/settings";
import {
  DEFAULT_SHARE_CAP,
  PENDING_PREFIX,
  shareVideoCore,
  type PermissionResult,
  type ShareArgs,
  type ShareDeps,
  type ShareDrive,
  type ShareResult,
  type ShareStore,
} from "@/lib/drive-share-core";

/**
 * משתף סרטון מלווה בדרייב עם מורה ספציפית (צפייה בלבד, בלי מייל הודעה מגוגל – האתר שולח מייל משלו) ומחזיר קישור ישיר.
 * שיתוף ברסיסים: לדרייב יש תקרה למספר המשתמשות הבודדות לכל קובץ, ולכן כשהרסיס הנוכחי מלא (תקרה רכה `drive_share_cap`, או
 * שדרייב מסרב בגלל מגבלה) נוצר עותק שרת חדש של הסרטון והבאות משותפות עליו. מורה שכבר שותפה מקבלת את אותו קישור.
 * לא זורקת אף פעם; null = השיתוף נכשל (למשל כתובת שאינה חשבון גוגל) והקורא חוזר לקישור לאתר.
 * הלוגיקה עצמה ב-drive-share-core.ts (נבדקת מול דרייב/DB מדומים: scripts/_verify-share-sharding.ts).
 */
export async function shareVideoWithUser(args: ShareArgs): Promise<ShareResult | null> {
  return shareVideoCore(realDeps, args);
}

/* ------------------------------ שכבת הנתונים (Neon) ------------------------------ */

const S = videoShareShards;

const store: ShareStore = {
  async getShare(materialId, userId) {
    const [row] = await db
      .select({ shardId: videoShares.shardId, email: videoShares.email, fileId: S.fileId })
      .from(videoShares)
      .innerJoin(S, eq(S.id, videoShares.shardId))
      .where(and(eq(videoShares.materialId, materialId), eq(videoShares.userId, userId)))
      .limit(1);
    if (!row) return null;
    const [c] = await db
      .select({ n: count() })
      .from(S)
      .where(and(eq(S.materialId, materialId), lt(S.id, row.shardId), notLike(S.fileId, `${PENDING_PREFIX}%`)));
    return { shardId: row.shardId, fileId: row.fileId, email: row.email, ordinal: Number(c?.n ?? 0) };
  },

  async ensureOriginalShard(materialId, originalFileId) {
    await db.insert(S).values({ materialId, fileId: originalFileId }).onConflictDoNothing({ target: S.fileId });
  },

  async listShards(materialId) {
    const rows = await db.select().from(S).where(eq(S.materialId, materialId)).orderBy(asc(S.id));
    return rows.map((r) => ({ id: r.id, fileId: r.fileId, shareCount: r.shareCount, createdAtMs: r.createdAt.getTime() }));
  },

  async reserveSlot(shardId, cap) {
    const rows = await db
      .update(S)
      .set({ shareCount: sql`${S.shareCount} + 1` })
      .where(and(eq(S.id, shardId), lt(S.shareCount, cap), notLike(S.fileId, `${PENDING_PREFIX}%`)))
      .returning({ id: S.id });
    return rows.length > 0;
  },

  async releaseSlot(shardId) {
    await db.update(S).set({ shareCount: sql`GREATEST(${S.shareCount} - 1, 0)` }).where(eq(S.id, shardId));
  },

  async markFull(shardId, cap) {
    await db.update(S).set({ shareCount: sql`GREATEST(${S.shareCount}, ${cap})` }).where(eq(S.id, shardId));
  },

  async claimNewShard(materialId) {
    const rows = await db
      .insert(S)
      .values({ materialId, fileId: `${PENDING_PREFIX}${materialId}` })
      .onConflictDoNothing({ target: S.fileId })
      .returning({ id: S.id });
    return rows[0] ?? null;
  },

  async finalizeShard(shardId, fileId) {
    const rows = await db
      .update(S)
      .set({ fileId })
      .where(and(eq(S.id, shardId), like(S.fileId, `${PENDING_PREFIX}%`)))
      .returning({ id: S.id });
    return rows.length > 0;
  },

  async dropShard(shardId) {
    await db.delete(S).where(and(eq(S.id, shardId), like(S.fileId, `${PENDING_PREFIX}%`)));
  },

  async dropStalePlaceholders(materialId, cutoffMs) {
    await db.delete(S).where(and(eq(S.materialId, materialId), like(S.fileId, `${PENDING_PREFIX}%`), lt(S.createdAt, new Date(cutoffMs))));
  },

  async recordShare(row) {
    const rows = await db
      .insert(videoShares)
      .values(row)
      .onConflictDoNothing({ target: [videoShares.materialId, videoShares.userId] })
      .returning({ id: videoShares.id });
    return { inserted: rows.length > 0 };
  },

  async updateShareEmail(materialId, userId, email) {
    await db.update(videoShares).set({ email }).where(and(eq(videoShares.materialId, materialId), eq(videoShares.userId, userId)));
  },
};

/* ------------------------------ שכבת הדרייב ------------------------------ */

let copiesFolderId: string | null = null;

/** תיקיית העותקים המוסתרת תחת שורש הארכיון (נמצאת לפי שם, ונוצרת עם תגית appProperties.shareShards="1" אם חסרה). */
async function getShareCopiesFolderId(): Promise<string> {
  if (copiesFolderId) return copiesFolderId;
  const rootId = await getRootFolderId();
  const q = `name = '${SHARE_COPIES_FOLDER_NAME}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await driveFetchAuthed(
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`,
    {},
    { tries: 2, timeoutMs: 20_000 },
  );
  if (found.ok) {
    const j = (await found.json()) as { files?: { id: string }[] };
    if (j.files?.[0]?.id) return (copiesFolderId = j.files[0].id);
  }
  const created = await driveFetchAuthed(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: SHARE_COPIES_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rootId],
        appProperties: { shareShards: "1" },
        description: "עותקי סרטונים לשיתוף אישי עם מורות (תקרת שיתוף לקובץ בדרייב) — לא למחוק ולא להזיז; האתר מנהל אותם",
      }),
    },
    { tries: 1, timeoutMs: 20_000 },
  );
  if (!created.ok) throw new Error(`יצירת תיקיית עותקי השיתוף נכשלה (${created.status})`);
  return (copiesFolderId = ((await created.json()) as { id: string }).id);
}

const drive: ShareDrive = {
  async createPermission(fileId, email): Promise<PermissionResult> {
    try {
      const res = await driveFetchAuthed(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true&fields=id,role`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }) },
        { tries: 2, timeoutMs: 20_000 },
      );
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      let reason = "";
      let message = text.slice(0, 200);
      try {
        const j = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string; message?: string }[] } };
        reason = j.error?.errors?.[0]?.reason ?? "";
        message = j.error?.message ?? j.error?.errors?.[0]?.message ?? message;
      } catch {
        /* גוף לא JSON — נשאר הטקסט הגולמי */
      }
      return { ok: false, status: res.status, reason, message };
    } catch (e) {
      return { ok: false, status: 0, reason: "network", message: e instanceof Error ? e.message : String(e) };
    }
  },

  async copyOriginal(originalFileId, name) {
    const parentId = await getShareCopiesFolderId();
    const r = await driveCopyFile(originalFileId, { name, parentId, appProperties: { shareShardOf: originalFileId }, description: "bagrut-video-share-copy" });
    return { fileId: r.fileId };
  },

  async trashFile(fileId) {
    await driveFetchAuthed(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) },
      { tries: 1, timeoutMs: 15_000 },
    );
  },
};

const realDeps: ShareDeps = {
  store,
  drive,
  getCap: async () => {
    try {
      return await getNumber("drive_share_cap");
    } catch {
      return DEFAULT_SHARE_CAP;
    }
  },
};
