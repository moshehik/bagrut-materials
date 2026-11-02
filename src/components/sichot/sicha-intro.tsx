
/**
 * באנר ההוראות הקבוע שמופיע מיד בכניסה לתיקיית מאגר השיחות (חגים / אקטואליה והשקפה,
 * תחת שיחה / חברה / כישורי חיים). באותו עיצוב של "שימי לב!" ו"מסלולים ומחירים":
 * חלונית כחולה כהה עם טבעת זהב וכרטיסי זהב בהיר במסגרת שחורה.
 */
const RULES = [
  {
    nut: "/images/nuts/one-05.webp",
    text: (
      <>
        כל שיחה שמועלית צריכה להתאים למסירה של{" "}
        <span className="underline decoration-2 underline-offset-4">45 דקות לפחות</span> — לא רעיון
        קצר, אלא שיעור שלם ומוכן.
      </>
    ),
  },
  {
    nut: "/images/nuts/two-01.webp",
    text: (
      <>
        אחרי שמעבירים שיעור אפשר לסמן &quot;השתמשתי בו&quot; — כך כולן יודעות אילו שיעורים הכי בשימוש.
      </>
    ),
  },
  {
    nut: "/images/nuts/one-03.webp",
    text: (
      <>
        יש רעיון למשחק, פעילות, סיפור או מדרש שמשלים שיחה קיימת? לוחצות על ה-&quot;+&quot; ליד
        השיחה ומוסיפות.
      </>
    ),
  },
];

export function SichaIntro({ folderTitle }: { folderTitle: string }) {
  return (
    <section className="gate-panel" aria-labelledby="sicha-intro-h">
      <span className="gold-ring" aria-hidden="true" />

      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/nuts/many-04.webp" alt="" aria-hidden className="h-14 w-auto shrink-0" />
        <div className="min-w-0">
          <h2 id="sicha-intro-h" className="text-2xl md:text-3xl">
            ברוכה הבאה למאגר השיחות!
          </h2>
          <p className="text-base md:text-lg" style={{ color: "rgba(255,255,255,0.88)" }}>
            כאן מורות מכל הארץ חולקות שיחות מוכנות למסירה בנושאי {folderTitle}, כדי שכולנו נוכל
            להעביר שיעור איכותי בלי להתחיל מאפס.
          </p>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {RULES.map(({ nut, text }, i) => (
          <li key={i} className="gate-card flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nut} alt="" aria-hidden className="h-9 w-9 shrink-0 object-contain" />
            <span className="text-base leading-snug">{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
