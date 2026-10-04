"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bot, Play } from "lucide-react";
import { setLoopEnabledAction, runAgentNowAction } from "@/lib/actions/agentSystem";

/**
 * מתג הפעלה/השבתה של סוכן קלוד האוטומטי (ה-workflow ב-GitHub). המתג הוא הדגל
 * agent_loop_status ב-DB — ה-workflow בודק אותו בכל הרצה לפני שהוא מפעיל את קלוד,
 * כך שכיבוי כאן עוצר מיד כל הרצה עתידית (הרצה שכבר בעיצומה מסיימת את סבבה).
 * כל החלפה ושליחת "הרץ עכשיו" נרשמות ביומן הפעולות וביומן הסוכן.
 */
export function AgentToggle({
  initialEnabled,
  idleMinutes,
  compact = false,
}: {
  initialEnabled: boolean;
  idleMinutes: number;
  compact?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle() {
    const next = !enabled;
    setMsg(null);
    startTransition(async () => {
      try {
        await setLoopEnabledAction(next);
        setEnabled(next);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "שגיאה");
      }
    });
  }

  function runNow() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await runAgentNowAction();
        setMsg(
          !r.sent
            ? "ההפעלה לא נשלחה — חסר GH_DISPATCH_TOKEN ב-Vercel (ה-cron ירוץ בכל 5 דקות בכל מקרה)."
            : r.loopEnabled
              ? "נשלחה הפעלה מיידית — הסוכן יתחיל תוך כמה שניות."
              : "נשלחה הפעלה, אבל המתג כבוי ולכן ה-workflow ידלג. הדליקי אותו קודם.",
        );
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "שגיאה");
      }
    });
  }

  return (
    <div className={`card ${compact ? "p-4" : "p-6"} flex flex-wrap items-center gap-4`}>
      <span
        className={`grid h-11 w-11 place-items-center rounded-2xl ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-foreground/5 text-muted"}`}
        aria-hidden
      >
        <Bot className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg font-bold">
          סוכן קלוד (GitHub) — {enabled ? "פעיל" : "מושבת"}
        </div>
        <div className="text-xs text-muted">
          {enabled
            ? idleMinutes < 0
              ? "ממתין לדיווח הראשון. בודק כל 5 דקות וגם מיד כשנפתח דיווח."
              : `פעילות אחרונה לפני ${idleMinutes} דק׳. בודק כל 5 דקות וגם מיד כשנפתח דיווח.`
            : "לא ירוץ בשום מצב עד שיודלק. כל החלפה נרשמת ביומן."}
        </div>
        {msg && <div className="mt-1 text-xs text-oak-deep">{msg}</div>}
      </div>
      <div className="flex items-center gap-2">
        {!compact && (
          <button type="button" onClick={runNow} disabled={pending} className="btn btn-ghost !py-1.5 !px-3 text-xs">
            <Play className="h-3.5 w-3.5" aria-hidden /> הרץ עכשיו
          </button>
        )}
        {compact && (
          <Link href="/admin/agent" className="btn btn-ghost !py-1.5 !px-3 text-xs">
            יומן וניהול
          </Link>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="הפעלה או השבתה של סוכן קלוד"
          onClick={toggle}
          disabled={pending}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-emerald-500" : "bg-foreground/25"}`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "end-1" : "start-1"}`}
          />
        </button>
      </div>
    </div>
  );
}
