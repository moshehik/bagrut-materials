/**
 * תאריך בטבלאות הניהול: מוצג בקצרה (לועזי, עם/בלי שעה), ובטולטיפ של האתר (data-tip) – התאריך העברי והלועזי המלא.
 * רכיב טהור (בלי hooks) – אפשר להשתמש בו גם מרכיבי שרת וגם מרכיבי לקוח.
 * הערה: התאריך העברי מחושב לפי יום קלנדרי (לא לפי שקיעה).
 */
const TZ = "Asia/Jerusalem";

function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** "כ״ו בחשוון תשפ״ז" */
export function hebrewDateText(d: Date): string {
  try {
    return new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch {
    return "";
  }
}

/** "יום ראשון, 9.11.2026, 12:24" */
export function gregorianDateText(d: Date, withTime: boolean): string {
  const day = d.toLocaleDateString("he-IL", { timeZone: TZ, weekday: "long" });
  const date = d.toLocaleDateString("he-IL", { timeZone: TZ });
  const time = withTime ? d.toLocaleTimeString("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "";
  return `${day}, ${date}${time ? `, ${time}` : ""}`;
}

export function dateTipText(value: Date | string | number | null | undefined, withTime = false): string | undefined {
  const d = toDate(value);
  if (!d) return undefined;
  const heb = hebrewDateText(d);
  return `${heb ? `${heb}\n` : ""}${gregorianDateText(d, withTime)}`;
}

export function DT({
  value,
  time = false,
  label,
  className,
}: {
  value: Date | string | number | null | undefined;
  /** להציג גם שעה */
  time?: boolean;
  /** טקסט תצוגה במקום התאריך (למשל "לפני 2 דק׳") – הטולטיפ נשאר תאריך מלא עם שעה */
  label?: React.ReactNode;
  className?: string;
}) {
  const d = toDate(value);
  if (!d) return <>—</>;
  const shown =
    label ??
    (time
      ? d.toLocaleString("he-IL", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })
      : d.toLocaleDateString("he-IL", { timeZone: TZ }));
  return (
    <time dateTime={d.toISOString()} data-tip={dateTipText(d, time || label !== undefined)} className={className}>
      {shown}
    </time>
  );
}
