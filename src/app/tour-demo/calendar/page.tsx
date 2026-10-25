import type { Metadata } from "next";
import { hebrewMonths, hebrewToday } from "@/lib/hebrew-date";
import type { CalGroup } from "@/lib/download-groups";
import { AccountTitle } from "@/components/account-ui";
import { DownloadsCalendar } from "@/components/downloads-calendar";

export const metadata: Metadata = { title: "דוגמה ללוח ההורדות", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * דוגמה ציבורית ללוח "ההורדות שלי" לצורך הסיור באתר: אותו רכיב בדיוק כמו בלוח האמיתי
 * (/account/downloads/calendar, שדורש התחברות), אבל עם הורדות לדוגמה במקום נתוני משתמשת.
 */
export default async function TourDemoCalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const dayIso = (d: number) => new Date(month.firstMs + (d - 1) * 86_400_000).toISOString().slice(0, 10);

  const groups: CalGroup[] = [
    {
      dateIso: dayIso(3),
      categoryId: 1,
      folder: "פרק י – בא",
      chain: "תורה › 3 יחידות › חיצוני › בא › פרק י",
      whole: true,
      total: 4,
      items: [],
    },
    {
      dateIso: dayIso(7),
      categoryId: 2,
      folder: "פרק יג – בשלח",
      chain: "תורה › 3 יחידות › חיצוני › בשלח › פרק יג",
      whole: false,
      total: 5,
      items: [
        { materialId: 1, title: "שכפול לתלמידה – פרק יג", type: "student", time: "08:41" },
        { materialId: 2, title: "בוחן – פרק יג", type: "quiz", time: "08:43" },
      ],
    },
    {
      dateIso: dayIso(12),
      categoryId: 3,
      folder: "פרק א – יונה",
      chain: "נביא › 5 יחידות › תרי עשר › יונה › פרק א",
      whole: true,
      total: 5,
      items: [],
    },
    {
      dateIso: dayIso(12),
      categoryId: 2,
      folder: "פרק יג – בשלח",
      chain: "תורה › 3 יחידות › חיצוני › בשלח › פרק יג",
      whole: false,
      total: 5,
      items: [{ materialId: 3, title: "שכפול למורה – פרק יג", type: "teacher", time: "21:05" }],
    },
  ];

  const link = (y: number, m: string) => `/tour-demo/calendar?y=${y}&m=${encodeURIComponent(m)}`;

  return (
    <div className="acc-glass mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <AccountTitle
        title="ההורדות שלי"
        subtitle="דוגמה: כך נראה הלוח באזור האישי, אחרי שנרשמת ומורידה חומרים."
      />
      {/* הלוח מוקטן, ולידו חלון פירוט היום שנבחר: כך רואים בבת אחת גם את הלוח וגם מה נפתח כשלוחצים על יום */}
      <style>{`
        .tour-cal{zoom:.5}
        @media (min-width:640px){.tour-cal{zoom:.55}}
        @media (min-width:1024px){.tour-cal{zoom:.55;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:1.25rem;align-items:start}}
        .tour-cal > section{margin-top:1.25rem !important;max-width:none !important}
        @media (min-width:1024px){.tour-cal > section{margin-top:0 !important}}
      `}</style>
      <div className="tour-cal mt-6">
        <DownloadsCalendar
          year={year}
          monthKey={monthKey}
          groups={groups}
          hrefFor={link}
          mode="select"
          selectedIso={dayIso(7)}
          dayHref={(iso) => `${link(year, monthKey)}&d=${iso}`}
        />
      </div>
    </div>
  );
}
