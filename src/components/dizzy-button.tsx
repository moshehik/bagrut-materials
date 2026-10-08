"use client";

import { Pause, Play } from "lucide-react";
import { setCalm, useCalm } from "@/lib/calm-mode";

/**
 * "אני מסוחררת" – לחיצה מבטלת מיידית את כל האנימציות באתר, לחיצה חוזרת מחזירה.
 * המצב לא נשמר: בכל כניסה חדשה לאתר צריך ללחוץ שוב.
 * הטולטיפ הוא הטולטיפ המשותף של האתר (data-tip ← NutTooltip).
 */
export function DizzyButton() {
  const calm = useCalm();

  return (
    <button
      type="button"
      className="dizzy-btn"
      aria-pressed={calm}
      data-tip={calm ? "האנימציות כבויות.\nלחיצה נוספת תחזיר אותן" : "לחיצה על לחצן זה תבטל\nמיידית את כל האנימציות"}
      onClick={(e) => {
        setCalm(!calm);
        // הטולטיפ נעלם אחרי הלחיצה (כדי שלא יישאר עם הטקסט הישן), וחוזר כשהעכבר/המיקוד עוזבים ושבים
        e.currentTarget.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      }}
    >
      {calm ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
      אני מסוחררת
    </button>
  );
}
