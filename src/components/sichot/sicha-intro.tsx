import { Sparkles, FileText, Star, Lightbulb, RefreshCw } from "lucide-react";

/**
 * באנר ההוראות הקבוע שמופיע מיד בכניסה לתיקיית מאגר השיחות (חגים / אקטואליה והשקפה,
 * תחת שיחה / חברה / כישורי חיים). נעים ומזמין, בהתאם לבקשת המנהלת.
 */
export function SichaIntro({ folderTitle }: { folderTitle: string }) {
  return (
    <div className="card relative overflow-hidden p-6 md:p-8 bg-gradient-to-br from-blue-soft/70 via-white to-gold-soft/50">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white shadow-md text-xl" aria-hidden>
          <Sparkles className="h-5 w-5 text-blue-deep" />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold">ברוכה הבאה למאגר השיחות! 💛</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            כאן מורות מכל הארץ חולקות שיחות מוכנות למסירה בנושאי {folderTitle}, כדי שכולנו נוכל
            להעביר שיעור איכותי בלי להתחיל מאפס.
          </p>
        </div>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        <li className="flex items-start gap-2.5 text-sm leading-relaxed">
          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-blue-deep" aria-hidden />
          <span>
            כל שיחה שמועלית צריכה להתאים למסירה של <b>45 דקות לפחות</b> — לא רעיון קצר, אלא שיעור
            שלם ומוכן.
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-sm leading-relaxed">
          <Star className="h-4 w-4 mt-0.5 shrink-0 text-gold" aria-hidden />
          <span>
            אחרי שמעבירים שיעור אפשר לדרג אותו 1-5 ולסמן &quot;השתמשתי בו&quot; — כך כולן יודעות מה
            עבד הכי טוב.
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-sm leading-relaxed">
          <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-[#8a6500]" aria-hidden />
          <span>
            יש רעיון למשחק, פעילות, סיפור או מדרש שמשלים שיחה קיימת? לוחצות על ה-&quot;+&quot; ליד
            השיחה ומוסיפות.
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-sm leading-relaxed">
          <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 text-blue-deep" aria-hidden />
          <span>
            כדי לשמור על מאגר חי: כל מורה שמצטרפת מתחייבת להעלות שיחה חדשה אחת ל-6 שבועות (דירוג
            גבוה → פעם ב-10 שבועות). נשלח תזכורת ידידותית שבוע לפני המועד.
          </span>
        </li>
      </ul>
    </div>
  );
}
