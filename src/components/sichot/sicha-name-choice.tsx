"use client";

import { UserRound, VenetianMask } from "lucide-react";

/** בחירה באיזה שם להציג את המורה: בשמה האמיתי או בשם בדוי (משותף לטופס שיחות ולטופס סרטונים) */
export function SichaNameChoice({
  anonymous,
  setAnonymous,
  pseudonym,
  setPseudonym,
  disabled,
  idPrefix,
}: {
  anonymous: boolean;
  setAnonymous: (v: boolean) => void;
  pseudonym: string;
  setPseudonym: (v: string) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const options = [
    { anon: false, Icon: UserRound, label: "בשמי" },
    { anon: true, Icon: VenetianMask, label: "בשם בדוי" },
  ];
  const headId = `${idPrefix}-name-h`;
  return (
    <div role="radiogroup" aria-labelledby={headId}>
      <span id={headId} className="text-lg">
        באיזה שם להציג אותך?
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const selected = anonymous === o.anon;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => setAnonymous(o.anon)}
              className="seminar-opt"
              data-selected={selected}
            >
              <span className="seminar-opt-icon" aria-hidden>
                <o.Icon className="h-4 w-4" />
              </span>
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
      {anonymous && (
        <label className="mt-2 block animate-fade-up">
          <span className="text-base gate-soft">השם שיוצג למורות (שמך האמיתי נשמר רק אצל מנהלת האתר)</span>
          <input
            value={pseudonym}
            onChange={(e) => setPseudonym(e.target.value)}
            maxLength={40}
            disabled={disabled}
            className="input mt-1 font-sans text-base"
            placeholder="למשל: מורה מהצפון"
            aria-label="שם בדוי"
          />
        </label>
      )}
    </div>
  );
}
