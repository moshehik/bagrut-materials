"use client";

import { useEffect, useState } from "react";

/** עמוד ההדגמה של הסיור: אחרי שהתיקון ״נשלח״ בחלון, מוחלפת הכרטיסייה באחת שכבר יש בה אגוזי ״צפייה בשינויים״ ו״הורדת הקובץ המתוקן״ */
export function TourFixSwap({ before, after }: { before: React.ReactNode; after: React.ReactNode }) {
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    const on = () => setApplied(true);
    window.addEventListener("tour-fix-applied", on);
    return () => window.removeEventListener("tour-fix-applied", on);
  }, []);
  return <div className="mtc-grid">{applied ? after : before}</div>;
}
