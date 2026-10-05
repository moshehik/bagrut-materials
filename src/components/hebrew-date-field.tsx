"use client";

import { useMemo, useState } from "react";
import { currentHebrewYear, gematria, gematriaYear, hebrewMonths, hebrewToIso, isoToHebrew } from "@/lib/hebrew-date";

/**
 * בורר תאריך עברי (יום / חודש / שנה). השדה הנסתר `name` נשלח בטופס כתאריך לועזי YYYY-MM-DD,
 * כך שהשרת ממשיך לעבוד כרגיל; אם לא נבחר תאריך שלם – נשלח ריק (בלי סינון).
 */
export function HebrewDateField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  const initial = defaultValue ? isoToHebrew(defaultValue) : null;
  const thisYear = currentHebrewYear();
  const [year, setYear] = useState<number | "">(initial?.year ?? "");
  const [monthKey, setMonthKey] = useState<string>(initial?.monthKey ?? "");
  const [day, setDay] = useState<number | "">(initial?.day ?? "");

  const months = useMemo(() => (year ? hebrewMonths(year) : []), [year]);
  const month = months.find((m) => m.key === monthKey);
  const iso = year && month && day && day <= month.days ? hebrewToIso(year, monthKey, day) ?? "" : "";

  const years = Array.from({ length: 7 }, (_, i) => thisYear - i);

  return (
    <fieldset className="block">
      <legend className="text-xl">{label}</legend>
      <input type="hidden" name={name} value={iso} />
      <div className="mt-1 grid grid-cols-[4.6rem_minmax(0,1fr)_6.2rem] gap-2">
        <select
          aria-label={`${label} – יום`}
          className="gate-input !px-2"
          value={day}
          disabled={!month}
          onChange={(e) => setDay(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">יום</option>
          {Array.from({ length: month?.days ?? 0 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {gematria(d)}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} – חודש`}
          className="gate-input !px-2"
          value={monthKey}
          disabled={!year}
          onChange={(e) => {
            setMonthKey(e.target.value);
            setDay("");
          }}
        >
          <option value="">חודש</option>
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} – שנה`}
          className="gate-input !px-2"
          value={year}
          onChange={(e) => {
            const y = e.target.value ? Number(e.target.value) : "";
            setYear(y);
            const ms = y ? hebrewMonths(y) : [];
            const still = ms.find((m) => m.key === monthKey);
            if (!still) {
              setMonthKey("");
              setDay("");
            } else if (day && day > still.days) setDay("");
          }}
        >
          <option value="">שנה</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {gematriaYear(y)}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
