"use client";

import { useId, useState } from "react";
import { Pause, Play } from "lucide-react";
import { setCalm, useCalm } from "@/lib/calm-mode";

/**
 * "אני מסוחררת" – לחיצה מבטלת מיידית את כל האנימציות באתר, לחיצה חוזרת מחזירה.
 * המצב לא נשמר: בכל כניסה חדשה לאתר צריך ללחוץ שוב.
 */
export function DizzyButton() {
  const calm = useCalm();
  const tipId = useId();
  // הטולטיפ נעלם אחרי הלחיצה, וחוזר רק אחרי שהעכבר/המיקוד עזבו את הכפתור ושבו אליו
  const [tipHidden, setTipHidden] = useState(false);

  return (
    <div className="dizzy-wrap" dir="rtl" data-tip-hidden={tipHidden || undefined} onMouseLeave={() => setTipHidden(false)}>
      <button
        type="button"
        className="dizzy-btn"
        aria-pressed={calm}
        aria-describedby={tipId}
        onClick={() => {
          setCalm(!calm);
          setTipHidden(true);
        }}
        onBlur={() => setTipHidden(false)}
      >
        {calm ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        אני מסוחררת
      </button>
      <span id={tipId} role="tooltip" className="dizzy-tip">
        {calm ? "האנימציות כבויות. לחיצה נוספת תחזיר אותן" : "לחיצה על לחצן זה תבטל מיידית את כל האנימציות"}
      </span>
    </div>
  );
}
