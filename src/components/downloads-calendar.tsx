import Link from "next/link";
import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { HebrewCalendar, flags } from "@hebcal/core";
import {
  formatHebrewDate,
  gematria,
  gematriaYear,
  hebrewMonths,
  hebrewToday,
  jerusalemIso,
  downloadDayName,
  neighborMonth,
} from "@/lib/hebrew-date";
import type { CalGroup } from "@/lib/download-groups";
import type { CalPurchase } from "@/lib/purchase-calendar";
import { PlanNut, TypeIcon } from "@/components/account-ui";
import { ScrollToSelected } from "@/components/scroll-to-selected";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const LOCALE = "he-x-NoNikud";

type DayInfo = { parsha?: string; labels: string[]; holiday: boolean };

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** פרשת השבוע, חגים, צומות וראשי חדשים (לוח ישראל) לכל יום בטווח */
function eventsByDay(firstIso: string, lastIso: string): Map<string, DayInfo> {
  const out = new Map<string, DayInfo>();
  const evs = HebrewCalendar.calendar({
    start: new Date(`${firstIso}T00:00:00`),
    end: new Date(`${lastIso}T00:00:00`),
    sedrot: true,
    il: true,
    noModern: true,
    locale: LOCALE,
  });
  for (const e of evs) {
    const iso = localIso(e.getDate().greg());
    const info = out.get(iso) ?? { labels: [], holiday: false };
    const f = e.getFlags();
    const text = e.render(LOCALE);
    if (f & flags.PARSHA_HASHAVUA) {
      info.parsha = text.replace(/^פרשת\s+/, "");
    } else if (f & flags.ROSH_CHODESH) {
      info.labels.push(text);
    } else {
      info.labels.push(text);
      info.holiday = true;
    }
    out.set(iso, info);
  }
  return out;
}

const filesOf = (gs: CalGroup[]) => gs.reduce((n, g) => n + g.items.length, 0);

/**
 * לוח שנה עברי של חודש: ריבועים בעיצוב האתר, פרשת השבוע בשבתות, חגים, ומה שהורד בכל יום.
 * בתא היום מופיעים שמות התיקיות בלבד; ברשימת היום – התיקייה, ולידה "כל התיקייה" (הורדה תיקייה שלמה)
 * או פירוט הקבצים שהורדו ממנה (הורדה חלקית).
 * hrefFor – קישור לחודש אחר. dayHref – ימים עם הורדות לחיצים ופותחים את רשימת היום (selectedIso).
 */
export function DownloadsCalendar({
  year,
  monthKey,
  groups,
  hrefFor,
  dayHref,
  selectedIso,
  mode = "all",
  filter,
  showRedownload = false,
  purchases = [],
}: {
  year: number;
  monthKey: string;
  groups: CalGroup[];
  hrefFor: (year: number, monthKey: string) => string;
  dayHref?: (iso: string) => string;
  selectedIso?: string;
  /** all = ברירת מחדל מציגה רשימת כל החודש; select = רשימה רק אחרי בחירת יום (ללוח המנהלת) */
  mode?: "all" | "select";
  /** תוכן שמוצג בחלונית הלוח מעל הרשת (סינון לפי סוג) */
  filter?: React.ReactNode;
  /** קישור "הורידי שוב" ליד כל קובץ (בלוח של הלקוחה) */
  showRedownload?: boolean;
  /** רכישות (מנוי שנתי, הורדה בודדת, ממלאת מקום…) – מסומנות ביום הרכישה, עם אגוז המסלול */
  purchases?: CalPurchase[];
}) {
  const months = hebrewMonths(year);
  const month = months.find((m) => m.key === monthKey) ?? months[0];
  const firstIso = new Date(month.firstMs).toISOString().slice(0, 10);
  const lastIso = new Date(month.firstMs + (month.days - 1) * 86_400_000).toISOString().slice(0, 10);
  const info = eventsByDay(firstIso, lastIso);

  const byDay = new Map<string, CalGroup[]>();
  for (const g of groups) {
    if (g.dateIso < firstIso || g.dateIso > lastIso) continue;
    byDay.set(g.dateIso, [...(byDay.get(g.dateIso) ?? []), g]);
  }
  const todayIso = jerusalemIso(new Date());
  const today = hebrewToday();

  const lead = new Date(month.firstMs).getUTCDay(); // 0 = ראשון
  const cells: ({ day: number; iso: string; dow: number } | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= month.days; d++) {
    const iso = new Date(month.firstMs + (d - 1) * 86_400_000).toISOString().slice(0, 10);
    cells.push({ day: d, iso, dow: (lead + d - 1) % 7 });
  }
  while (cells.length % 7) cells.push(null);

  const prev = neighborMonth(year, month.key, -1);
  const next = neighborMonth(year, month.key, 1);
  const monthTitle = `${month.name} ${gematriaYear(year)}`;
  const isThisMonth = today.year === year && today.monthKey === month.key;
  const monthGroups = [...byDay.values()].flat();
  const totalFiles = filesOf(monthGroups);
  const buysByDay = new Map<string, CalPurchase[]>();
  for (const p of purchases) {
    if (p.dateIso < firstIso || p.dateIso > lastIso) continue;
    buysByDay.set(p.dateIso, [...(buysByDay.get(p.dateIso) ?? []), p]);
  }
  const totalBuys = [...buysByDay.values()].reduce((n, l) => n + l.length, 0);
  const listDays = [...new Set([...byDay.keys(), ...buysByDay.keys()])].sort();
  const selected = selectedIso && selectedIso >= firstIso && selectedIso <= lastIso ? selectedIso : undefined;

  return (
    <>
      <section className="gate-panel mx-auto mt-8 max-w-4xl sm:!p-8" aria-label={`לוח שנה – ${monthTitle}`}>
        <span className="gold-ring" aria-hidden="true" />
        {filter && <div className="mb-5">{filter}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={hrefFor(prev.year, prev.key)} className="btn btn-gold btn-gate py-1.5" aria-label="החודש הקודם">
            <ChevronRight className="h-4 w-4" aria-hidden /> החודש הקודם
          </Link>
          <div className="text-center">
            <h2 className="text-3xl">{monthTitle}</h2>
            <p className="text-lg text-[#ffd45a]">
              {totalFiles > 0
                ? `${totalFiles} הורדות · ${monthGroups.length} תיקיות`
                : "אין הורדות בחודש"}
              {totalBuys > 0 ? ` · ${totalBuys} רכישות` : ""}
            </p>
          </div>
          <Link href={hrefFor(next.year, next.key)} className="btn btn-gold btn-gate py-1.5" aria-label="החודש הבא">
            החודש הבא <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="mt-5 overflow-x-auto pb-1">
          <div className="min-w-[44rem]">
            <div className="cal-grid" role="row">
              {WEEKDAYS.map((w) => (
                <div key={w} className="cal-head">
                  {w}
                </div>
              ))}
            </div>
            <div className="cal-grid mt-2">
              {cells.map((c, i) => {
                if (!c) return <div key={`b${i}`} className="cal-cell cal-empty" aria-hidden />;
                const ev = info.get(c.iso);
                const dayGroups = byDay.get(c.iso) ?? [];
                const files = filesOf(dayGroups);
                const folders = [...new Set(dayGroups.map((g) => g.folder))];
                const buys = buysByDay.get(c.iso) ?? [];
                const clickable = (files > 0 || buys.length > 0) && !!dayHref;
                const cls = [
                  "cal-cell",
                  ev?.holiday ? "cal-holiday" : c.dow === 6 ? "cal-shabbat" : "",
                  files || buys.length ? "cal-has" : "",
                  c.iso === todayIso ? "cal-today" : "",
                  c.iso === selected ? "cal-selected" : "",
                  clickable ? "cal-link" : "",
                ].join(" ");
                const shown = folders.length <= 3 ? folders : folders.slice(0, 2);
                const inner = (
                  <>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xl leading-none">{gematria(c.day)}</span>
                      {files > 0 && <span className="cal-count">{files}</span>}
                    </div>
                    {ev?.parsha && <span className="cal-parsha">{ev.parsha}</span>}
                    {c.dow === 6 && files > 0 && <span className="cal-label">מוצאי שבת</span>}
                    {ev?.labels.map((l) => (
                      <span key={l} className="cal-label">
                        {l}
                      </span>
                    ))}
                    {buys.map((b, k) => (
                      <span key={`b${k}`} className="cal-buy">
                        <PlanNut plan={b.plan} className="cal-nut" />
                        <span>{b.label}</span>
                      </span>
                    ))}
                    {shown.map((f) => (
                      <span key={f} className="cal-folder">
                        {f}
                      </span>
                    ))}
                    {folders.length > 3 && <span className="cal-folder">ועוד {folders.length - 2}…</span>}
                  </>
                );
                return clickable ? (
                  <Link
                    key={c.iso}
                    href={dayHref(c.iso)}
                    scroll={false}
                    className={cls}
                    aria-label={`${formatHebrewDate(`${c.iso}T12:00:00Z`)} – ${files} הורדות${buys.length ? ", רכישה" : ""}, לפתיחת הרשימה`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={c.iso} className={cls} title={folders.join("\n") || undefined}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-base">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5"><i className="cal-key cal-shabbat" /> שבת (עם פרשת השבוע)</span>
            <span className="flex items-center gap-1.5"><i className="cal-key cal-holiday" /> חג / צום</span>
            <span className="flex items-center gap-1.5"><i className="cal-key cal-has" /> יום עם הורדות</span>
          </span>
          {!isThisMonth && (
            <Link href={hrefFor(today.year, today.monthKey)} className="btn gate-skip py-1">
              לחודש הנוכחי
            </Link>
          )}
        </div>
      </section>

      {(selected || mode === "all") && (
      <section
        id="day-list"
        className="gate-panel mx-auto mt-8 max-w-3xl scroll-mt-20 sm:!p-8"
        aria-label={selected ? "ההורדות ביום שנבחר" : "ההורדות בחודש לפי יום"}
      >
        <span className="gold-ring" aria-hidden="true" />
        <ScrollToSelected when={selected} />
        <h2 className="text-3xl">{selected ? "ההורדות ביום שנבחר" : "ההורדות לפי יום"}</h2>
        {listDays.length === 0 && !selected ? (
          <p className="gate-card mt-4 py-6 text-center text-xl">לא היו הורדות ב{monthTitle}.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {(selected ? [selected] : listDays).map((iso) => {
              const ev = info.get(iso);
              const dayGroups = byDay.get(iso) ?? [];
              const dayBuys = buysByDay.get(iso) ?? [];
              return (
                <li key={iso} className="gate-card">
                  <p className="text-xl">
                    {formatHebrewDate(`${iso}T12:00:00Z`)} · {downloadDayName(iso)}
                    {ev?.parsha ? ` · פרשת ${ev.parsha}` : ""}
                    {ev?.labels.length ? ` · ${ev.labels.join(", ")}` : ""}
                    {dayGroups.length > 0 ? ` · ${filesOf(dayGroups)} הורדות` : ""}
                  </p>
                  {dayBuys.map((b, k) => (
                    <div key={`b${k}`} className="mt-2 flex items-center gap-3 border-b-2 border-dashed border-black/30 pb-2">
                      <PlanNut plan={b.plan} className="cal-nut-lg" />
                      <span className="min-w-0 flex-1 text-xl">
                        רכשה: {b.label}
                        {b.who && <span className="gate-soft text-base"> · {b.who}</span>}
                      </span>
                      <span className="gate-soft text-base tabular-nums">{b.time}</span>
                    </div>
                  ))}
                  {dayGroups.length === 0 ? (
                    dayBuys.length === 0 && <p className="gate-soft py-2 text-lg">לא היו הורדות ביום זה.</p>
                  ) : (
                    <ul className="acc-list mt-1">
                      {dayGroups.map((g, j) => (
                        <li key={j} className="py-3">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <FolderOpen className="h-5 w-5 shrink-0 text-[#16244e]" aria-hidden />
                            <span className="min-w-0 flex-1 text-xl leading-snug">
                              {g.forum && g.href ? (
                                <Link href={g.href} className="acc-link">
                                  פורום · {g.chain}
                                </Link>
                              ) : (
                                g.chain
                              )}
                              {g.who && <span className="gate-soft text-base"> · {g.who}</span>}
                            </span>
                            {g.forum ? (
                              <span className="gate-soft text-base">{g.items.length} בפורום</span>
                            ) : g.whole ? (
                              <span className="cal-whole">כל התיקייה</span>
                            ) : (
                              <span className="gate-soft text-base">
                                חלק מהתיקייה · {g.items.length} מתוך {g.total || g.items.length}
                              </span>
                            )}
                          </div>
                          {(g.forum || !g.whole) && (
                            <ul className="mt-2 space-y-1.5 ps-8">
                              {g.items.map((it, k) => (
                                <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                  <TypeIcon type={it.type ?? "other"} className="h-7 w-7" />
                                  <span className="min-w-0 flex-1 text-lg">
                                    {it.title}
                                    {it.sub && <span className="gate-soft block text-base">{it.sub}</span>}
                                  </span>
                                  <span className="gate-soft text-base tabular-nums">{it.time}</span>
                                  {it.href && (
                                    <Link href={it.href} className="acc-link text-base">
                                      לפתיחה בפורום
                                    </Link>
                                  )}
                                  {showRedownload && !g.forum && (
                                    <a href={`/api/download/${it.materialId}`} className="acc-link text-base">
                                      הורידי שוב
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {selected && (
          <div className="mt-4">
            <Link href={hrefFor(year, month.key)} scroll={false} className="btn gate-skip py-1">
              סגירת הרשימה
            </Link>
          </div>
        )}
      </section>
      )}
    </>
  );
}
