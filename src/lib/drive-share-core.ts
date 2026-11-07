/**
 * ליבת השיתוף של סרטונים מלווים בדרייב, עם "רסיסים" (shards) — בלי תלות ב-DB/דרייב/server-only, כדי שאפשר לבדוק אותה
 * מול מימוש-דמה בזיכרון (scripts/_verify-share-sharding.ts). המימוש האמיתי (Neon + Drive REST) ב-drive-share.ts.
 *
 * הבעיה: לדרייב יש תקרה למספר המשתמשות הבודדות שאפשר לשתף איתן קובץ אחד. הפתרון: לכל חומר-סרטון זוכרים באילו
 * "רסיסים" (קובץ מקורי + עותקים בצד השרת של גוגל) שותפה כל מורה. כשהרסיס הנוכחי מגיע לתקרה הרכה (`drive_share_cap`),
 * או שדרייב עצמו מסרב בגלל מגבלה — נוצר עותק חדש והמורות הבאות משותפות עליו. מורה שכבר יש לה שורה מקבלת תמיד את אותו קישור.
 *
 * כללי בטיחות:
 *  - הפונקציה לא זורקת אף פעם; כל כשל → null והקורא חוזר לקישור לאתר.
 *  - כשל שאינו "מגבלה" (למשל 400 invalidSharingRequest — כתובת שאינה חשבון גוגל) לא יוצר רסיס.
 *  - ספירה בטוחה לתחרות: `UPDATE … SET share_count = share_count + 1 WHERE share_count < cap RETURNING` (אטומי, משפט אחד —
 *    חיבור ה-HTTP של Neon לא תומך בטרנזקציות אינטראקטיביות ולא ב-advisory locks).
 *  - יצירת רסיס מתואמת בעזרת שורת-שריון אחת לחומר (`file_id = 'pending:<materialId>'`, אילוץ unique): רק בקשה אחת מעתיקה,
 *    האחרות ממתינות. אחרי הזכייה בשריון בודקים שוב אם בינתיים נפתח מקום (סוגר את חלון התחרות מול עדכון/finalize שכבר נעשה).
 */

export const PENDING_PREFIX = "pending:";
export const DEFAULT_SHARE_CAP = 90;
export const driveFileLink = (fileId: string) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;

export type ShardRow = { id: number; fileId: string; shareCount: number; createdAtMs: number };
export type ShareRow = { shardId: number; fileId: string; email: string; ordinal: number };
export type PermissionResult = { ok: true } | { ok: false; status: number; reason: string; message: string };

/** שכבת הנתונים (Neon בפועל; בבדיקה — מפה בזיכרון). כל פעולה אטומית ברמת משפט אחד. */
export interface ShareStore {
  getShare(materialId: number, userId: number): Promise<ShareRow | null>;
  /** מכניס את הרסיס 0 (הקובץ המקורי) אם עוד אין — idempotent */
  ensureOriginalShard(materialId: number, originalFileId: string): Promise<void>;
  /** כל הרסיסים של החומר (כולל שורת-שריון), מסודרים לפי id עולה */
  listShards(materialId: number): Promise<ShardRow[]>;
  /** שריון מקום: share_count+1 רק אם share_count < cap (ורק ברסיס אמיתי). true = נשמר */
  reserveSlot(shardId: number, cap: number): Promise<boolean>;
  releaseSlot(shardId: number): Promise<void>;
  /** מסמן רסיס כמלא: share_count = max(share_count, cap) */
  markFull(shardId: number, cap: number): Promise<void>;
  /** שורת-שריון ליצירת רסיס; null אם כבר קיימת אחת לחומר (מישהי אחרת יוצרת) */
  claimNewShard(materialId: number): Promise<{ id: number } | null>;
  /** הופך שורת-שריון לרסיס אמיתי; false אם השורה כבר לא קיימת (נמחקה כתקועה) */
  finalizeShard(shardId: number, fileId: string): Promise<boolean>;
  dropShard(shardId: number): Promise<void>;
  /** מוחק שורות-שריון שנוצרו לפני `cutoffMs` (יוצרת שנפלה באמצע) */
  dropStalePlaceholders(materialId: number, cutoffMs: number): Promise<void>;
  /** מוסיף שורת שיתוף; inserted=false אם כבר קיימת למורה הזו (תחרות בין שתי בקשות) */
  recordShare(row: { materialId: number; userId: number; email: string; shardId: number }): Promise<{ inserted: boolean }>;
  updateShareEmail(materialId: number, userId: number, email: string): Promise<void>;
}

export interface ShareDrive {
  createPermission(fileId: string, email: string): Promise<PermissionResult>;
  /** עותק בצד השרת של גוגל לתיקיית העותקים המוסתרת. זורק בכשל */
  copyOriginal(originalFileId: string, name: string): Promise<{ fileId: string }>;
  /** מחיקה לאשפה של עותק יתום (best-effort) */
  trashFile(fileId: string): Promise<void>;
}

export type ShareLog = { info: (m: string, d?: unknown) => void; warn: (m: string, d?: unknown) => void; error: (m: string, d?: unknown) => void };

export interface ShareDeps {
  store: ShareStore;
  drive: ShareDrive;
  getCap: () => Promise<number>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: ShareLog;
  /** כוונון (בדיקות מקצרות) */
  pollMs?: number;
  waitMs?: number;
  staleMs?: number;
  maxLoops?: number;
}

export type ShareArgs = { materialId: number; originalFileId: string; userId: number; email: string; title?: string };
export type ShareResult = { link: string; shard: number; reused: boolean; newShard: boolean };

/* ------------------------------ סיווג כשל של דרייב ------------------------------ */

// סיבות שמעידות על מגבלת שיתוף של הקובץ עצמו — יצירת עותק פותרת אותן.
const SHARD_LIMIT_REASONS = new Set(["sharingRateLimitExceeded", "limitExceeded"]);
// סיבות שהן *לא* מגבלה פר-קובץ: עומס/מכסת פרויקט חולפים, בקשה פסולה וכו' — עותק חדש לא יעזור, אסור ליצור רסיס.
const NOT_SHARD_LIMIT_REASONS = new Set([
  "userRateLimitExceeded",
  "rateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "storageQuotaExceeded",
  "invalidSharingRequest",
  "notFound",
  "authError",
  "backendError",
]);

/**
 * האם כשל ההרשאה מעיד שהרסיס הנוכחי מלא. הסיבה האמיתית של דרייב לתקרת-משתמשים עוד לא אומתה (ר' הלוג "drive share failed" —
 * reason הגולמי נרשם בכל כשל), ולכן מעבר לרשימות הסיבות המוכרות מתקבלת גם הודעה שמזכירה מגבלה, כשהסטטוס 403.
 * 429 (עומס חולף) ו-userRateLimitExceeded אינם נחשבים מגבלת-קובץ.
 */
export function isShardLimitFailure(f: { status: number; reason: string; message: string }): boolean {
  if (f.status === 429) return false;
  if (NOT_SHARD_LIMIT_REASONS.has(f.reason)) return false;
  if (SHARD_LIMIT_REASONS.has(f.reason)) return true;
  return f.status === 403 && /limit|too many|maximum|exceed/i.test(f.message);
}

/* ------------------------------ הלוגיקה ------------------------------ */

const sanitizeName = (s: string) => s.replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "video";
const isPending = (s: ShardRow) => s.fileId.startsWith(PENDING_PREFIX);

export async function shareVideoCore(deps: ShareDeps, args: ShareArgs): Promise<ShareResult | null> {
  const { store, drive } = deps;
  const log: ShareLog = deps.log ?? console;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const pollMs = deps.pollMs ?? 1_500;
  const waitMs = deps.waitMs ?? 75_000;
  const staleMs = deps.staleMs ?? 4 * 60_000;
  const maxLoops = deps.maxLoops ?? 400;
  const { materialId, originalFileId, userId, email, title } = args;

  try {
    let cap = Math.floor(await deps.getCap());
    if (!Number.isFinite(cap) || cap < 1) cap = DEFAULT_SHARE_CAP;

    // מורה שכבר שותפה: אותו קישור, בלי הרשאה חדשה (idempotent)
    const existing = await store.getShare(materialId, userId);
    if (existing) {
      if (existing.email.toLowerCase() === email.toLowerCase()) {
        return { link: driveFileLink(existing.fileId), shard: existing.ordinal, reused: true, newShard: false };
      }
      // כתובת המייל שלה השתנתה מאז: נותנים הרשאה גם לכתובת החדשה, על אותו רסיס
      const r = await drive.createPermission(existing.fileId, email);
      if (!r.ok) {
        log.error("drive share (email changed) failed", { materialId, userId, status: r.status, reason: r.reason, message: r.message });
        return null;
      }
      await store.updateShareEmail(materialId, userId, email);
      return { link: driveFileLink(existing.fileId), shard: existing.ordinal, reused: true, newShard: false };
    }

    await store.ensureOriginalShard(materialId, originalFileId);

    const deadline = now() + waitMs;
    let limitSwitches = 0;
    let createdHere = false;

    for (let loop = 0; loop < maxLoops; loop++) {
      await store.dropStalePlaceholders(materialId, now() - staleMs);
      const shards = await store.listShards(materialId);
      const real = shards.filter((s) => !isPending(s));

      // 1) רסיס עם מקום פנוי (ממלאים לפי הסדר: המקורי, אחריו העותקים)
      let slot: { shard: ShardRow; ordinal: number } | null = null;
      for (let i = 0; i < real.length; i++) {
        const s = real[i];
        if (s.shareCount >= cap) continue;
        if (await store.reserveSlot(s.id, cap)) {
          slot = { shard: s, ordinal: i };
          break;
        }
      }

      if (!slot) {
        // 2) אין מקום באף רסיס — יוצרים רסיס חדש (בקשה אחת בלבד לחומר; האחרות ממתינות)
        if (now() > deadline) {
          log.error("video share: timed out waiting for a new shard", { materialId });
          return null;
        }
        const claim = await store.claimNewShard(materialId);
        if (!claim) {
          await sleep(pollMs);
          continue;
        }
        // אחרי הזכייה בשריון: אולי בינתיים נפתח מקום (יוצרת קודמת סיימה) — אז לא יוצרים עוד עותק
        const again = (await store.listShards(materialId)).filter((s) => !isPending(s));
        if (again.some((s) => s.shareCount < cap)) {
          await store.dropShard(claim.id);
          continue;
        }
        const ordinal = again.length;
        const name = `${sanitizeName(title ?? `video ${materialId}`)} (שיתוף ${ordinal})`;
        let copyId: string;
        try {
          copyId = (await drive.copyOriginal(originalFileId, name)).fileId;
        } catch (e) {
          await store.dropShard(claim.id).catch(() => {});
          log.error("video share: copying the original failed", { materialId, error: e instanceof Error ? e.message : String(e) });
          return null;
        }
        const ok = await store.finalizeShard(claim.id, copyId);
        if (!ok) {
          // השריון נמחק כתקוע בזמן שההעתקה רצה — העותק יתום
          log.error("video share: placeholder vanished before finalize; trashing orphan copy", { materialId, copyId });
          await drive.trashFile(copyId).catch(() => {});
          return null;
        }
        createdHere = true;
        log.info("video share: new shard created", { materialId, ordinal, copyId });
        continue;
      }

      // 3) מחלקים הרשאה על הרסיס שנשמר
      const { shard, ordinal } = slot;
      const perm = await drive.createPermission(shard.fileId, email);
      if (perm.ok) {
        const rec = await store.recordShare({ materialId, userId, email, shardId: shard.id });
        if (!rec.inserted) {
          // בקשה מקבילה של אותה מורה הקדימה אותנו: מחזירים את הקישור שלה ומשחררים את המקום שהחזקנו
          await store.releaseSlot(shard.id);
          const mine = await store.getShare(materialId, userId);
          if (mine) return { link: driveFileLink(mine.fileId), shard: mine.ordinal, reused: true, newShard: false };
          return null;
        }
        return { link: driveFileLink(shard.fileId), shard: ordinal, reused: false, newShard: createdHere };
      }

      log.error("drive share failed", { materialId, shard: ordinal, status: perm.status, reason: perm.reason, message: perm.message });
      if (isShardLimitFailure(perm)) {
        // עותק שזה עתה נוצר שגם הוא נדחה = כנראה מגבלה כללית, לא של הקובץ: לא ממשיכים ליצור עותקים (אין לולאה אינסופית)
        if (limitSwitches >= 1) {
          await store.releaseSlot(shard.id);
          log.error("video share: limit error again after switching shard; giving up", { materialId });
          return null;
        }
        limitSwitches++;
        await store.markFull(shard.id, cap);
        continue;
      }
      // כשל אחר (למשל לא חשבון גוגל): לא יוצרים רסיס, משחררים את המקום
      await store.releaseSlot(shard.id);
      return null;
    }
    log.error("video share: loop limit reached", { materialId });
    return null;
  } catch (e) {
    log.error("video share error", e instanceof Error ? e.message : e);
    return null;
  }
}
