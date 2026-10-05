import { requireAdminPage } from "@/lib/session";
import Link from "next/link";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { downloads, materials, users } from "@/db/schema";
import { hebrewMonths, hebrewToday } from "@/lib/hebrew-date";
import { buildGroups, TYPE_ORDER } from "@/lib/download-groups";
import { loadForumGroups } from "@/lib/forum-calendar";
import { loadPurchaseEvents } from "@/lib/purchase-calendar";
import { TypeFilter } from "@/components/account-ui";
import { DownloadsCalendar } from "@/components/downloads-calendar";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isoOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** לוח שנה עברי של כל ההורדות באתר: מספר ההורדות בכל יום, ולחיצה על יום פותחת מה הורד ועל ידי מי */
export default async function AdminDownloadsCalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
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
  // "פורום" = מתי המורות פרסמו והגיבו בפורום (במקום הורדות)
  const rows = type === "forum" ? [] : await db
    .select({
      createdAt: downloads.createdAt,
      materialId: materials.id,
      title: materials.title,
      kind: materials.kind,
      categoryId: materials.categoryId,
      userId: users.id,
      userName: users.name,
    })
    .from(downloads)
    .innerJoin(materials, eq(downloads.materialId, materials.id))
    .innerJoin(users, eq(downloads.userId, users.id))
    .where(and(gte(downloads.createdAt, from), lte(downloads.createdAt, to)))
    .orderBy(asc(downloads.createdAt))
    .limit(30000);

  const groups =
    type === "forum" ? await loadForumGroups({ from, to }) : await buildGroups(rows, { withWho: true, type });

  // רכישות מנוי מסומנות בלוח כשאין סינון לפי סוג
  const buys = type ? [] : await loadPurchaseEvents({ from, to });

  const link = (y: number, m: string, extra = "") =>
    `/admin/downloads/calendar?y=${y}&m=${encodeURIComponent(m)}${type ? `&t=${type}` : ""}${extra}`;
  const d = first(sp.d);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">הורדות בלוח שנה עברי</h2>
        <Link href="/admin/downloads" className="btn btn-ghost !py-1.5 !px-3 text-xs ms-auto">
          לרשימת ההורדות
        </Link>
      </div>
      <DownloadsCalendar
        year={year}
        monthKey={monthKey}
        groups={groups}
        hrefFor={(y, m) => link(y, m)}
        dayHref={(iso) => `${link(year, monthKey, `&d=${iso}`)}#day-list`}
        selectedIso={isoOk(d) ? d : undefined}
        mode="select"
        purchases={buys}
        filter={
          <TypeFilter
            active={type}
            hrefFor={(t) => `/admin/downloads/calendar?y=${year}&m=${encodeURIComponent(monthKey)}${t ? `&t=${t}` : ""}`}
          />
        }
      />
    </div>
  );
}
