import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";

/*
 * קמפיין הנחה מוגבל במקומות (/offer/<slug>). הסכום נקבע תמיד בשרת (/api/pay/intent) – הדפדפן לא מעביר סכום.
 *
 * מקום "תפוס" (held) = שורת campaign_seats במצב reserved ש:
 *   - הבקשה שלה בנדרים ממתינה לאישור ידני / שולמה (לתמיד), או
 *   - הבקשה שלה ממתינה לתשלום והזמנת המקום עוד בתוקף (reserved_until), או
 *   - עוד אין לה בקשה (המורה הרגע תפסה מקום) והזמנת המקום בתוקף.
 * בקשה שנכשלה / בוטלה / פגה, או הזמנה שפג תוקפה – המקום חוזר להיות פנוי לאחרות.
 * התפיסה עצמה היא UPDATE אחד עם SELECT … FOR UPDATE SKIP LOCKED – שתי מורות באותה שנייה לא יקבלו את אותו מקום (ולא יחצו את המכסה).
 * המונה סופר רק תפיסות של הקמפיין: נרשמות קיימות (ניסיון) לא נספרות.
 */

export type Campaign = typeof campaigns.$inferSelect;

/** כמה זמן מקום שמור למורה שלחצה "תפסי מקום" ועוד לא יצרה בקשת תשלום */
export const SEAT_HOLD_MINUTES = 45;
/** כמה זמן מקום שמור אחרי שנוצרה בקשת תשלום (עד שהתשלום מזוהה). תשלום שזוהה / ממתין לאישור – שומר את המקום לתמיד */
export const SEAT_PAY_HOLD_HOURS = 3;

/** תנאי "תפוס" על שורת campaign_seats בכינוי `s` (טקסט קבוע – בלי קלט משתמש) */
const held = (s: string) => `(${s}.status = 'reserved' AND (
  EXISTS (SELECT 1 FROM nedarim_payments p WHERE p.id = ${s}.payment_id AND (p.status IN ('processing','paid') OR (p.status = 'pending' AND ${s}.reserved_until > now())))
  OR (${s}.payment_id IS NULL AND ${s}.reserved_until > now())
))`;

const SLUG_RE = /^[a-z0-9-]{1,40}$/;
/** slug מאומת ב-getCampaign (SLUG_RE) לפני שהוא נכנס ל-SQL; כאן עוד שכבה */
const q = (slug: string) => {
  if (!SLUG_RE.test(slug)) throw new Error("slug לא תקין");
  return `'${slug}'`;
};

export async function getCampaign(slug: string): Promise<Campaign | null> {
  if (!SLUG_RE.test(slug)) return null;
  const [c] = await db.select().from(campaigns).where(eq(campaigns.slug, slug)).limit(1);
  return c ?? null;
}

export function campaignIsOpen(c: Campaign, now = new Date()): boolean {
  return c.active && (!c.endsAt || c.endsAt > now);
}

export type SeatStats = { total: number; taken: number; remaining: number };

export async function getSeatStats(c: Pick<Campaign, "slug" | "totalSeats">): Promise<SeatStats> {
  const r = await db.execute<{ taken: number }>(
    sql.raw(`SELECT count(*) FILTER (WHERE ${held("s")})::int AS taken FROM campaign_seats s WHERE s.campaign_slug = ${q(c.slug)}`),
  );
  const taken = Math.min(c.totalSeats, Number(r.rows[0]?.taken ?? 0));
  return { total: c.totalSeats, taken, remaining: Math.max(0, c.totalSeats - taken) };
}

export type Seat = { id: number; slot: number; paymentId: number | null };

/** המקום התפוס של המורה בקמפיין (אם יש ועדיין בתוקף) */
export async function getUserSeat(slug: string, userId: number): Promise<Seat | null> {
  const r = await db.execute<{ id: number; slot: number; payment_id: number | null }>(
    sql.raw(`SELECT s.id, s.slot, s.payment_id FROM campaign_seats s WHERE s.campaign_slug = ${q(slug)} AND s.user_id = ${Math.trunc(userId)} AND ${held("s")} LIMIT 1`),
  );
  const row = r.rows[0];
  return row ? { id: Number(row.id), slot: Number(row.slot), paymentId: row.payment_id === null ? null : Number(row.payment_id) } : null;
}

export type ClaimResult = { ok: true; seat: Seat; already: boolean } | { ok: false; soldOut: true };

/** תפיסת מקום למורה: אם כבר יש לה – מאריכים; אחרת לוקחים את המקום הפנוי הראשון. soldOut כשאין מקום */
export async function claimSeat(c: Campaign, userId: number): Promise<ClaimResult> {
  const slug = q(c.slug);
  const uid = Math.trunc(userId);
  const mine = await getUserSeat(c.slug, uid);
  if (mine) {
    if (mine.paymentId === null) {
      await db.execute(sql.raw(`UPDATE campaign_seats SET reserved_until = GREATEST(reserved_until, now() + interval '${SEAT_HOLD_MINUTES} minutes') WHERE id = ${mine.id}`));
    }
    return { ok: true, seat: mine, already: true };
  }
  // מקום ישן של המורה שכבר לא תפוס (תשלום שנכשל / הזמנה שפגה) – משחררים, כדי שהאינדקס הייחודי על (קמפיין, משתמשת) לא יחסום
  await db.execute(
    sql.raw(`UPDATE campaign_seats s SET status = 'free', user_id = NULL, payment_id = NULL, reserved_until = NULL WHERE s.campaign_slug = ${slug} AND s.user_id = ${uid} AND NOT ${held("s")}`),
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await db.execute<{ id: number; slot: number }>(
        sql.raw(`UPDATE campaign_seats SET status = 'reserved', user_id = ${uid}, payment_id = NULL, reserved_until = now() + interval '${SEAT_HOLD_MINUTES} minutes', claimed_at = now()
          WHERE id = (SELECT s.id FROM campaign_seats s WHERE s.campaign_slug = ${slug} AND NOT ${held("s")} ORDER BY s.slot LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING id, slot`),
      );
      const row = r.rows[0];
      if (row) return { ok: true, seat: { id: Number(row.id), slot: Number(row.slot), paymentId: null }, already: false };
    } catch (e) {
      // לחיצה כפולה במקביל של אותה מורה: השורה השנייה נתקלה באינדקס הייחודי – המקום כבר שלה
      if (/unique|duplicate/i.test(e instanceof Error ? e.message : String(e))) {
        const again = await getUserSeat(c.slug, uid);
        if (again) return { ok: true, seat: again, already: true };
      }
      throw e;
    }
    // לא נמצא מקום: או שאזלו, או שהפנוי נעול כרגע ע"י תפיסה מקבילה – בודקים ומנסים שוב בקצרה
    const stats = await getSeatStats(c);
    if (stats.remaining <= 0 && attempt >= 1) break;
    await new Promise((res) => setTimeout(res, 150));
  }
  return { ok: false, soldOut: true };
}

/** קושרים את בקשת התשלום למקום ומאריכים את ההזמנה עד שהתשלום יזוהה */
export async function attachPaymentToSeat(seatId: number, paymentId: number): Promise<void> {
  await db.execute(
    sql.raw(`UPDATE campaign_seats SET payment_id = ${Math.trunc(paymentId)}, reserved_until = now() + interval '${SEAT_PAY_HOLD_HOURS} hours' WHERE id = ${Math.trunc(seatId)}`),
  );
}

/** מחיר אחרי הנחת הקמפיין (אגורות) */
export const campaignAmount = (listAmount: number, percent: number) => Math.round((listAmount * (100 - percent)) / 100);
