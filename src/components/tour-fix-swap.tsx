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
  // עמודה אחת ברוחב כרטיס רגיל (25rem): ברשת של שתי עמודות בתוך מיכל צר הכרטיס מצטמצם ל-240px ושורת האגוזים והכיתובים נדחסת
  return (
    <div className="mtc-grid" style={{ gridTemplateColumns: "minmax(0, 25rem)" }}>
      {applied ? after : before}
    </div>
  );
}
