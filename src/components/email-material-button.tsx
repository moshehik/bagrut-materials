"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * "שליחה למייל": שולחת את הקובץ (עם המספר האישי מוטבע, בדיוק כמו בהורדה) לכתובת המייל המאומתת של המשתמשת.
 * POST ל-/api/download/[id] (ר' route.ts). נספרת כהורדה במכסה.
 */
export function EmailMaterialButton({
  materialId,
  className,
  children,
  fixes,
  tip,
  ariaLabel,
}: {
  materialId: number;
  className?: string;
  children: React.ReactNode;
  /** "all" – גרסת הקובץ עם התיקונים (כמו ?fixes=all בהורדה) */
  fixes?: "all";
  /** טולטיפ האתר המעוצב (data-tip ← NutTooltip) */
  tip?: string;
  ariaLabel?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  // ההודעה (הצלחה / שגיאה) נעלמת מעצמה, כדי שלא תישאר תלויה מעל הכרטיסייה
  useEffect(() => {
    if (state !== "done" && state !== "error") return;
    const t = setTimeout(() => {
      setState("idle");
      setMsg(null);
    }, 8000);
    return () => clearTimeout(t);
  }, [state]);

  async function send() {
    if (state === "sending") return;
    setState("sending");
    setMsg(null);
    try {
      const res = await fetch(`/api/download/${materialId}${fixes ? `?fixes=${fixes}` : ""}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; error?: string; redirect?: string };
      if (data.ok) {
        setState("done");
        setMsg(`הקובץ נשלח אל ${data.email}`);
        return;
      }
      if (data.redirect && res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
        return;
      }
      setState("error");
      setMsg(data.error ?? "השליחה נכשלה, נסי שוב בעוד רגע");
    } catch {
      setState("error");
      setMsg("השליחה נכשלה, נסי שוב בעוד רגע");
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${className ?? ""} cursor-pointer`}
        onClick={send}
        disabled={state === "sending"}
        data-tip={tip}
        aria-label={ariaLabel}
      >
        {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
      {msg && (
        <span role="status" aria-live="polite" className={`email-material-msg ${state === "error" ? "is-error" : ""}`}>
          {msg}
        </span>
      )}
    </>
  );
}
