import "server-only";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads, purchases, type Material, type User } from "@/db/schema";
import { getNumber } from "./settings";
import type { Entitlement } from "./data";

/*
 * מכסות הורדה/צפייה – משותף ל-/api/download, /api/download-folder ו-/api/preview (צפייה מלאה).
 *
 * העיקרון: "הזמנה" (reservation) לפני השליחה, לא רישום אחרי:
 *  1. מנוי עם מכסה – UPDATE מותנה ואטומי על purchases.downloads_used (אין שורה חוזרת = המכסה נוצלה).
 *  2. שורת downloads לכל קובץ – INSERT מותנה במגבלה היומית ובמגבלה לחומר (max_downloads_per_user),
 *     בפקודה אחת, כך שהספירה והרישום לא מתפצלים לשני שלבים שאפשר לעקוף במקביל.
 * אם השליחה נכשלת לפני שהקובץ יצא (קובץ חסר בדרייב, המרה/הטבעה נכשלו) – release() מוחק את
 * השורות ומזכה את המנוי. אם הבדיקה עצמה זורקת – המסלול חוסם (503), לא מאשר.
 *
 * צפייה מלאה באתר (preview) נספרת בדיוק כמו הורדה, ונרשמת בעמודת via כ-"view:<via>" –
 * אין לטבלת downloads עמודה ייעודית לכך, ו-via (varchar 20) הוא השדה המתאים ביותר.
 */

export type EntitlementOk = Extract<Entitlement, { ok: true }>;
export type QuotaKind = "download" | "view";
export type QuotaItem = { material: Material; ent: EntitlementOk };

export type QuotaDenied =
  | { reason: "daily_limit"; dailyLimit: number; used: number; requested: number }
  | { reason: "period_limit"; periodLimit: number; used: number; requested: number }
  | { reason: "material_limit"; materialId: number; maxDownloadsPerUser: number }
  | { reason: "quota"; purchaseId: number };

export type Reservation = {
  entries: { downloadId: number; materialId: number; purchaseId: number | null }[];
  /** כמה הורדות נזקפו לכל מנוי (purchaseId → n) */
  subscriptionUse: Map<number, number>;
  /**
   * ביטול ההזמנה – כשהשליחה נכשלה לפני שהקובץ יצא. בלי פרמטר: הכל;
   * עם רשימת materialIds: רק הקבצים האלה (לזיפ שחלק מקבציו נכשלו).
   */
  release: (materialIds?: number[]) => Promise<void>;
};

export type ReserveResult = { ok: true; reservation: Reservation } | { ok: false; denied: QuotaDenied };

/** הערך שנרשם בעמודת downloads.via: הורדה = via כרגיל, צפייה מלאה = "view:<via>" */
export function viaMarker(kind: QuotaKind, via: EntitlementOk["via"]) {
  return kind === "view" ? `view:${via}` : via;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** המגבלה היומית שבתוקף למשתמשת (אישית, ואם אין – הכללית; 0 = ללא מגבלה) */
export async function dailyLimitFor(user: Pick<User, "dailyDownloadLimit">) {
  const globalLimit = await getNumber("daily_download_limit");
  return user.dailyDownloadLimit ?? globalLimit;
}

/** כמה שורות downloads (הורדות + צפיות מלאות) נרשמו היום למשתמשת */
export async function countToday(userId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(downloads)
    .where(and(eq(downloads.userId, userId), gte(downloads.createdAt, startOfToday())));
  return Number(row?.n ?? 0);
}

/** כמה הורדות נותרו היום (null = ללא מגבלה) */
export async function dailyRemaining(user: Pick<User, "id" | "dailyDownloadLimit">): Promise<number | null> {
  const limit = await dailyLimitFor(user);
  if (!(limit > 0)) return null;
  return Math.max(0, limit - (await countToday(user.id)));
}

/** חלון המכסה ה"חודשית": 30 הימים האחרונים (מתגלגל) */
export const PERIOD_DAYS = 30;

/** המגבלה ל-30 הימים האחרונים (0 = ללא מגבלה) – מההגדרות */
export async function periodLimitFor() {
  return getNumber("monthly_download_limit");
}

function periodStart() {
  return new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

/** כמה שורות downloads (הורדות + צפיות מלאות) נרשמו ב-30 הימים האחרונים למשתמשת */
export async function countPeriod(userId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(downloads)
    .where(and(eq(downloads.userId, userId), gte(downloads.createdAt, periodStart())));
  return Number(row?.n ?? 0);
}

/** כמה הורדות נותרו ב-30 הימים (null = ללא מגבלה) */
export async function periodRemaining(user: Pick<User, "id">): Promise<number | null> {
  const limit = await periodLimitFor();
  if (!(limit > 0)) return null;
  return Math.max(0, limit - (await countPeriod(user.id)));
}

/** כמה הורדות נותרו במנוי (null = ללא מכסה / המנוי לא נמצא) */
export async function subscriptionRemaining(purchaseId: number): Promise<number | null> {
  const [p] = await db
    .select({ limit: purchases.downloadsLimit, used: purchases.downloadsUsed })
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .limit(1);
  if (!p || p.limit === null) return null;
  return Math.max(0, p.limit - p.used);
}

/** מזכה מנוי ב-n הורדות (לא יורד מתחת ל-0) */
async function refundSubscription(purchaseId: number, n: number) {
  await db
    .update(purchases)
    .set({ downloadsUsed: sql`GREATEST(${purchases.downloadsUsed} - ${n}, 0)` })
    .where(eq(purchases.id, purchaseId));
}

/** אחרי שה-INSERT המותנה נחסם: מבררים איזו מגבלה נחצתה (לתיעוד ולהודעה) */
async function explainDenial(
  user: Pick<User, "id">,
  items: QuotaItem[],
  dailyLimit: number,
  periodLimit: number,
): Promise<QuotaDenied> {
  const used = await countToday(user.id);
  if (dailyLimit > 0 && used + items.length > dailyLimit) {
    return { reason: "daily_limit", dailyLimit, used, requested: items.length };
  }
  if (periodLimit > 0) {
    const usedPeriod = await countPeriod(user.id);
    if (usedPeriod + items.length > periodLimit) {
      return { reason: "period_limit", periodLimit, used: usedPeriod, requested: items.length };
    }
  }
  for (const it of items) {
    const max = it.material.maxDownloadsPerUser;
    if (max === null || max <= 0) continue;
    const [row] = await db
      .select({ n: count() })
      .from(downloads)
      .where(and(eq(downloads.userId, user.id), eq(downloads.materialId, it.material.id)));
    if (Number(row?.n ?? 0) >= max) {
      return { reason: "material_limit", materialId: it.material.id, maxDownloadsPerUser: max };
    }
  }
  // נחסם בגלל מרוץ (ההספירה השתנתה בין ה-INSERT לבירור) – מדווחים כמגבלה יומית
  return { reason: "daily_limit", dailyLimit, used, requested: items.length };
}

/**
 * הזמנת מכסה ל-items (לא למנהלת – המסלולים מדלגים עליה). מחזירה reservation להצלחה,
 * או denied כשאחת המגבלות נחצתה. זורקת אם מסד הנתונים נכשל – על המסלול לחסום (503).
 */
export async function reserveDownloads(opts: {
  user: Pick<User, "id" | "personalCode" | "dailyDownloadLimit">;
  items: QuotaItem[];
  kind: QuotaKind;
  meta: { ip: string | null; userAgent: string | null };
}): Promise<ReserveResult> {
  const { user, items, kind, meta } = opts;
  if (items.length === 0) {
    return { ok: true, reservation: { entries: [], subscriptionUse: new Map(), release: async () => {} } };
  }

  // 1. מנויים – UPDATE מותנה לכל מנוי (אטומי: אין שורה חוזרת = אין מקום במכסה)
  const subscriptionUse = new Map<number, number>();
  for (const it of items) {
    if (it.ent.via === "subscription" && it.ent.purchaseId) {
      subscriptionUse.set(it.ent.purchaseId, (subscriptionUse.get(it.ent.purchaseId) ?? 0) + 1);
    }
  }
  const claimed: [number, number][] = [];
  const refundAll = async () => {
    while (claimed.length) {
      const [pid, n] = claimed.pop()!;
      await refundSubscription(pid, n);
    }
  };
  for (const [pid, n] of subscriptionUse) {
    const got = await db
      .update(purchases)
      .set({
        downloadsUsed: sql`${purchases.downloadsUsed} + ${n}`,
        // מנוי שמתחיל בהורדה הראשונה: endsAt ריק + termDays → תאריך סיום מעכשיו (שורות אחרות לא משתנות)
        endsAt: sql`COALESCE(${purchases.endsAt}, now() + ${purchases.termDays} * interval '1 day')`,
      })
      .where(
        and(
          eq(purchases.id, pid),
          eq(purchases.status, "active"),
          sql`(${purchases.downloadsLimit} IS NULL OR ${purchases.downloadsUsed} + ${n} <= ${purchases.downloadsLimit})`,
        ),
      )
      .returning({ id: purchases.id });
    if (!got.length) {
      await refundAll();
      return { ok: false, denied: { reason: "quota", purchaseId: pid } };
    }
    claimed.push([pid, n]);
    // שאר שורות אותה הזמנה (מקצועות נוספים באותו מנוי) מסתיימות באותו תאריך – ההורדה הראשונה בהזמנה מתחילה את כולן
    await db.execute(sql`
      UPDATE purchases p SET ends_at = s.ends_at
      FROM purchases s
      WHERE s.id = ${pid}::int AND s.ends_at IS NOT NULL AND s.term_days IS NOT NULL AND s.payment_ref IS NOT NULL
        AND p.user_id = s.user_id AND p.payment_ref = s.payment_ref
        AND p.ends_at IS NULL AND p.term_days IS NOT NULL AND p.status = 'active'
    `);
  }

  // 2. שורות downloads – INSERT מותנה במגבלה היומית ובמגבלה לחומר, בפקודה אחת
  let insertedIds: number[] = [];
  let dailyLimit = 0;
  let periodLimit = 0;
  try {
    dailyLimit = await dailyLimitFor(user);
    periodLimit = await periodLimitFor();
    const start = startOfToday().toISOString();
    const pStart = periodStart().toISOString();
    const n = items.length;
    const values = sql.join(
      items.map((it) => {
        const max = it.material.maxDownloadsPerUser;
        const maxPerUser = max !== null && max > 0 ? max : null;
        return sql`(${user.id}::int, ${it.material.id}::int, ${user.personalCode}::varchar, ${meta.ip}::varchar, ${meta.userAgent}::text, ${viaMarker(kind, it.ent.via)}::varchar, ${maxPerUser}::int)`;
      }),
      sql`, `,
    );
    const res = await db.execute<{ id: number; material_id: number }>(sql`
      INSERT INTO downloads (user_id, material_id, watermark, ip, user_agent, via)
      SELECT v.user_id, v.material_id, v.watermark, v.ip, v.user_agent, v.via
      FROM (VALUES ${values}) AS v(user_id, material_id, watermark, ip, user_agent, via, max_per_user)
      WHERE (
        ${dailyLimit}::int <= 0
        OR (SELECT count(*) FROM downloads d WHERE d.user_id = ${user.id}::int AND d.created_at >= ${start}::timestamp) + ${n}::int <= ${dailyLimit}::int
      )
      AND (
        ${periodLimit}::int <= 0
        OR (SELECT count(*) FROM downloads d WHERE d.user_id = ${user.id}::int AND d.created_at >= ${pStart}::timestamp) + ${n}::int <= ${periodLimit}::int
      )
      AND (
        v.max_per_user IS NULL
        OR (SELECT count(*) FROM downloads d WHERE d.user_id = ${user.id}::int AND d.material_id = v.material_id) < v.max_per_user
      )
      RETURNING id, material_id
    `);
    insertedIds = res.rows.map((r) => Number(r.id));
    if (insertedIds.length !== n) {
      if (insertedIds.length) await db.delete(downloads).where(inArray(downloads.id, insertedIds));
      await refundAll();
      return { ok: false, denied: await explainDenial(user, items, dailyLimit, periodLimit) };
    }
    const byMaterial = new Map(res.rows.map((r) => [Number(r.material_id), Number(r.id)]));
    const entries = items.map((it) => ({
      downloadId: byMaterial.get(it.material.id)!,
      materialId: it.material.id,
      purchaseId: it.ent.via === "subscription" && it.ent.purchaseId ? it.ent.purchaseId : null,
    }));

    let released = new Set<number>();
    const release = async (materialIds?: number[]) => {
      const toRelease = entries.filter(
        (e) => !released.has(e.downloadId) && (!materialIds || materialIds.includes(e.materialId)),
      );
      if (!toRelease.length) return;
      released = new Set([...released, ...toRelease.map((e) => e.downloadId)]);
      await db.delete(downloads).where(inArray(downloads.id, toRelease.map((e) => e.downloadId)));
      const perPurchase = new Map<number, number>();
      for (const e of toRelease) {
        if (e.purchaseId !== null) perPurchase.set(e.purchaseId, (perPurchase.get(e.purchaseId) ?? 0) + 1);
      }
      for (const [pid, n] of perPurchase) await refundSubscription(pid, n);
    };
    return { ok: true, reservation: { entries, subscriptionUse, release } };
  } catch (e) {
    // הבדיקה/הרישום נכשלו – מחזירים את מה שכבר נתפס ומעבירים את השגיאה למסלול (שיחסום)
    try {
      if (insertedIds.length) await db.delete(downloads).where(inArray(downloads.id, insertedIds));
      await refundAll();
    } catch (e2) {
      console.error("download quota rollback failed", e2);
    }
    throw e;
  }
}
