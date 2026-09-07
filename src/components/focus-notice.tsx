"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const DISMISS_KEY = "focus-notice-tashpaz-dismissed";

/**
 * הודעה צפה מעוצבת שמסבירה את סימון "לא נדרש" (✂) במפה, לפי מיקוד תנ"ך תשפ"ז
 * ממשרד החינוך. נסגרת לצמיתות (נשמר ב-localStorage) עד שינוי מפורש.
 */
export function FocusNotice() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="card relative mt-6 flex items-start gap-3 border border-gold/30 bg-gold-soft/50 p-4 sm:p-5 animate-pop">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-2xl" aria-hidden>
        🎯
      </span>
      <div className="min-w-[200px] flex-1">
        <p className="text-sm font-semibold">מיקוד תנ"ך תשפ"ז</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          משרד החינוך פרסם השנה מה לא נכלל בבחינות החיצוניות בתנ"ך (שאלונים 3381, 3281). הנושאים
          שהוצאו מהמיקוד מסומנים במפה בקו חוצה וסמל מספריים{" "}
          <span aria-hidden>✂️</span> — כדי שתדעו בדיוק על מה להתמקד.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="סגירת ההודעה"
        className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-ink/10 hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
