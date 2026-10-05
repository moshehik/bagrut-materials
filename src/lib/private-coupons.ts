import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { privateCoupons, type User } from "@/db/schema";

export type PrivateCoupon = typeof privateCoupons.$inferSelect;

/** בלי תווים מבלבלים (0/O, 1/I) */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCouponCode() {
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `LZ-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeCode(v: string) {
  return v.trim().toUpperCase().replace(/\s+/g, "");
}

export function parseSubjectIds(c: Pick<PrivateCoupon, "subjectIds">): number[] {
  try {
    const arr = JSON.parse(c.subjectIds ?? "[]");
    return Array.isArray(arr) ? arr.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/** קופונים פעילים של המשתמשת: לפי כתובת המייל שלה, או כאלה ששייכה לעצמה בקוד */
export async function getActiveCouponsFor(user: Pick<User, "id" | "email">): Promise<PrivateCoupon[]> {
  return db
    .select()
    .from(privateCoupons)
    .where(
      and(
        eq(privateCoupons.status, "active"),
        or(isNull(privateCoupons.expiresAt), gt(privateCoupons.expiresAt, sql`now()`)),
        or(sql`lower(${privateCoupons.email}) = ${user.email.toLowerCase()}`, eq(privateCoupons.claimedBy, user.id)),
      ),
    )
    .orderBy(asc(privateCoupons.id));
}

/** קופון ההנחה הגבוה ביותר הפעיל של המשתמשת (או null) */
export async function getBestPercentCoupon(user: Pick<User, "id" | "email">) {
  const all = await getActiveCouponsFor(user);
  const pct = all.filter((c) => c.benefit === "percent" && (c.percent ?? 0) > 0);
  pct.sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  return pct[0] ?? null;
}

export function benefitText(c: Pick<PrivateCoupon, "benefit" | "percent" | "days">, subjectTitles: string[] = []) {
  if (c.benefit === "percent") return `${c.percent}% הנחה על הרכישה הבאה`;
  const list = subjectTitles.length ? `: ${subjectTitles.join(", ")}` : "";
  return `גישה חינם למקצועות${list} ל-${c.days} ימים`;
}
