import type { Metadata } from "next";
import { ColourSvg } from "@/components/colour-svg";
import { AccountTitle } from "@/components/account-ui";
import { SUBJECT_HOUSES, YEARLY_INCLUDED_SUBJECTS } from "@/lib/constants";
import { inlineHouse } from "@/lib/inline-images";

export const metadata: Metadata = { title: "דוגמה ל״המקצועות שלי״", robots: { index: false, follow: false } };

/**
 * דוגמה ציבורית לעמוד ״המקצועות במנוי השנתי״ לצורך הסיור באתר: אותו מבנה ואותן מחלקות כמו בעמוד האמיתי
 * (/account/subjects, שדורש התחברות), אבל עם מקצועות לדוגמה, בלי מסד נתונים ובלי שמירה אמיתית.
 * כשמשנים את המבנה של העמוד האמיתי – לעדכן גם כאן ואת התחנות ב-site-tour.tsx.
 */
const MINE = [
  { slug: "torah", title: "תורה", locked: true },
  { slug: "navi", title: "נביא", locked: false },
];
const OTHERS = ["כתובים", "ספרות", "אנגלית", "מחשבת ישראל"];

export default function TourDemoSubjectsPage() {
  const left = YEARLY_INCLUDED_SUBJECTS - MINE.length;
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle
        title="המקצועות במנוי השנתי"
        subtitle={`המנוי כולל עד ${YEARLY_INCLUDED_SUBJECTS} מקצועות באותו מחיר. אפשר להוסיף מקצוע בכל שלב, או להחליף מקצוע שעדיין לא הורדת ממנו.`}
      />

      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby="mine-h">
        <span className="gold-ring" aria-hidden="true" />
        <h2 id="mine-h" className="text-center text-3xl">המקצועות שלי</h2>
        <p className="mt-1 text-center text-[#ffd45a]">כל עוד לא התבצעה הורדה במקצוע, אפשר להחליף אותו במקצוע אחר.</p>
        <ul className="mt-6 space-y-4">
          {MINE.map((s) => (
            <li key={s.slug} className="gate-card gate-pick !cursor-default flex-wrap" data-tour-subject={s.locked ? "locked" : "swappable"}>
              {SUBJECT_HOUSES[s.slug] && (
                <ColourSvg className="gate-pick-house" src={inlineHouse(SUBJECT_HOUSES[s.slug]) as string} width={356} height={266} small />
              )}
              <span className="text-xl">{s.title}</span>
              {s.locked ? (
                <span className="ms-auto text-sm text-gray-500">בוצעה הורדה – אי אפשר להחליף</span>
              ) : (
                <div className="ms-auto flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="demo-swap">מקצוע חדש</label>
                  <select id="demo-swap" defaultValue="" className="gate-select">
                    <option value="" disabled>להחלפה במקצוע…</option>
                    {OTHERS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <button type="button" className="btn btn-gold btn-gate py-1">החלפה</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby="add-h">
        <span className="gold-ring" aria-hidden="true" />
        <h2 id="add-h" className="text-center text-3xl">הוספת מקצוע</h2>
        <p className="mt-1 text-center text-[#ffd45a]">
          אפשר להוסיף עוד {left === 1 ? "מקצוע אחד" : `${left} מקצועות`} באותו מחיר, בלי תשלום נוסף. המקצוע שיתווסף יסתיים יחד עם המנוי.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <label className="sr-only" htmlFor="demo-add">מקצוע להוספה</label>
          <select id="demo-add" defaultValue="" className="gate-select">
            <option value="" disabled>בחרי מקצוע…</option>
            {OTHERS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button type="button" className="btn btn-gold btn-gate py-1">הוספה</button>
        </div>
      </section>
    </div>
  );
}
