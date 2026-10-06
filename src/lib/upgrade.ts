import "server-only";
import { and, eq, gt, inArray, isNull, or, asc } from "drizzle-orm";
import { db } from "@/db";
import { purchases } from "@/db/schema";

type Purchase = typeof purchases.$inferSelect;

export type UpgradeOffer = {
  /** substitute_3m = ממלאת מקום 3 חודשים (כל שורות המקצועות של ההזמנה), daily = ממלאת מקום יומית */
  kind: "sub3" | "daily";
  rows: Purchase[];
  /** כמה שולם על התוכנית (באגורות) */
  paid: number;
  /** כמה נשאר לשלם על המנוי השנתי: מחיר מלא פחות מה ששולם */
  diff: number;
  /** ממלאת מקום 3 חודשים שכבר התחילה: מועד ההורדה הראשונה (ממנו נספרת השנה). null = עוד לא הורדה / יומית */
  activatedAt: Date | null;
  /** תאריך סיום התוכנית הנוכחית (3 חודשים שהתחילה); null אחרת */
  endsAt: Date | null;
  /** יומית: כמה צפיות/הורדות נותרו בסל */
  basketLeft: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** תוכניות ממלאת מקום פעילות של המשתמשת שאפשר לשדרג למנוי שנתי, עם מחיר ההפרש */
export async function loadUpgradeOffers(userId: number, yearlyPrice: number): Promise<UpgradeOffer[]> {
  const rows = await db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.status, "active"),
        inArray(purchases.plan, ["substitute_3m", "substitute_daily"]),
        or(isNull(purchases.endsAt), gt(purchases.endsAt, new Date())),
      ),
    )
    .orderBy(asc(purchases.id));

  const offers: UpgradeOffer[] = [];
  const groups = new Map<string, Purchase[]>();
  for (const r of rows) {
    if (r.plan === "substitute_daily") {
      const paid = r.amount;
      offers.push({
        kind: "daily",
        rows: [r],
        paid,
        diff: Math.max(0, yearlyPrice - paid),
        activatedAt: null,
        endsAt: null,
        basketLeft: r.downloadsLimit === null ? null : Math.max(0, r.downloadsLimit - r.downloadsUsed),
      });
      continue;
    }
    const key = r.paymentRef ?? `id-${r.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const group of groups.values()) {
    const paid = group.reduce((s, r) => s + r.amount, 0);
    const first = group[0];
    const endsAt = first.endsAt;
    const activatedAt = endsAt && first.termDays ? new Date(endsAt.getTime() - first.termDays * DAY_MS) : null;
    offers.push({
      kind: "sub3",
      rows: group,
      paid,
      diff: Math.max(0, yearlyPrice - paid),
      activatedAt,
      endsAt,
      basketLeft: null,
    });
  }
  return offers;
}

/** "3 חודשים", "חודש ו-5 ימים", "12 ימים" – כמה זמן נשאר עד endsAt */
export function formatTimeLeft(endsAt: Date, now: Date = new Date()): string {
  const days = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
  const months = Math.floor(days / 30);
  const rest = days % 30;
  const m = months === 0 ? "" : months === 1 ? "חודש" : `${months} חודשים`;
  const d = rest === 0 ? "" : rest === 1 ? "יום אחד" : `${rest} ימים`;
  if (m && d) return `${m} ו-${d}`;
  return m || d || "פחות מיום";
}
