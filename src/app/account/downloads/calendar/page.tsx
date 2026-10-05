import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { downloads, materials } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { hebrewMonths, hebrewToday } from "@/lib/hebrew-date";
import { buildGroups, TYPE_ORDER } from "@/lib/download-groups";
import { loadForumGroups } from "@/lib/forum-calendar";
import { loadPurchaseEvents } from "@/lib/purchase-calendar";
import { AccountTitle, BackButton, TypeFilter } from "@/components/account-ui";
import { DownloadsCalendar } from "@/components/downloads-calendar";

export const metadata: Metadata = { title: "הורדות בלוח שנה עברי" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isoOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function DownloadsCalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/downloads/calendar");

  const sp = await searchParams;
  const today = hebrewToday();
  let year = Number(first(sp.y)) || today.year;
  if (year < 5700 || year > 5900) year = today.year;
  const months = hebrewMonths(year);
  const monthKey = months.some((m) => m.key === first(sp.m))
    ? first(sp.m)
    : year === today.year
      ? today.monthKey
      : months[0].key;
  const month = months.find((m) => m.key === monthKey)!;
  const type = (TYPE_ORDER as string[]).includes(first(sp.t)) ? first(sp.t) : undefined;

  // חלון רחב (±יומיים) ואז סינון לפי התאריך האזרחי בשעון ישראל
  const from = new Date(month.firstMs - 2 * 86_400_000);
  const to = new Date(month.firstMs + (month.days + 1) * 86_400_000);
  // "פורום" = מתי המורה פרסמה והגיבה בפורום (במקום הורדות)
  const rows = type === "forum" ? [] : await db
    .select({
      createdAt: downloads.createdAt,
      materialId: materials.id,
      title: materials.title,
      kind: materials.kind,
      categoryId: materials.categoryId,
    })
    .from(downloads)
    .innerJoin(materials, eq(downloads.materialId, materials.id))
    .where(and(eq(downloads.userId, user.id), gte(downloads.createdAt, from), lte(downloads.createdAt, to)))
    .orderBy(asc(downloads.createdAt));

  const groups =
    type === "forum" ? await loadForumGroups({ from, to, userId: user.id }) : await buildGroups(rows, { type });

  // רכישות מנוי מסומנות בלוח כשאין סינון לפי סוג
  const buys = type ? [] : await loadPurchaseEvents({ from, to, userId: user.id });

  const link = (y: number, m: string, extra = "") =>
    `/account/downloads/calendar?y=${y}&m=${encodeURIComponent(m)}${type ? `&t=${type}` : ""}${extra}`;

  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle title="ההורדות שלי" subtitle="מתי הורדת, ומה – לפי לוח השנה. לחצי על יום כדי לראות את הפירוט." />
      <div className="flex justify-center sm:justify-start">
        <BackButton />
      </div>
      <DownloadsCalendar
        year={year}
        monthKey={monthKey}
        groups={groups}
        hrefFor={(y, m) => link(y, m)}
        dayHref={(iso) => `${link(year, monthKey, `&d=${iso}`)}#day-list`}
        selectedIso={isoOk(first(sp.d)) ? first(sp.d) : undefined}
        mode="select"
        purchases={buys}
        showRedownload
        filter={
          <TypeFilter
            active={type}
            hrefFor={(t) => `/account/downloads/calendar?y=${year}&m=${encodeURIComponent(monthKey)}${t ? `&t=${t}` : ""}`}
          />
        }
      />
    </div>
  );
}
