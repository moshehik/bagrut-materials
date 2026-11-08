"use client";

import { useState } from "react";
import { Mail, ShieldAlert } from "lucide-react";
import { lastFilterKind } from "@/lib/netfree-probe";

/**
 * הודעת "בנטפרי לא ניתן להוריד/לצפות בסרטון – אפשר לשלוח למייל ולצפות משם", בעיצוב חלון הצפייה של האתר.
 * הכול בהודעה אחת: הניסוח, כפתור "שליחה למייל" (POST ל-mailUrl, שולח קישור לסרטון) ופעולות נוספות לפי ההקשר (children).
 */
export function NetfreeNotice({
  mailUrl,
  compact,
  className = "",
  children,
}: {
  mailUrl?: string;
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const [mail, setMail] = useState<{ s: "idle" | "sending" | "sent" | "error"; email?: string }>({ s: "idle" });
  const who = lastFilterKind() === "other" ? "בסינון שלך" : "בנטפרי";
  const send = async () => {
    if (!mailUrl || mail.s === "sending") return;
    setMail({ s: "sending" });
    try {
      const res = await fetch(mailUrl, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { email?: string };
      setMail(res.ok ? { s: "sent", email: data.email } : { s: "error" });
    } catch {
      setMail({ s: "error" });
    }
  };
  return (
    <div className={`nf-block ${compact ? "nf-compact" : ""} ${className}`} role="alert">
      <div className="nf-card">
        <span className="nf-ico">
          <ShieldAlert className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <h4 className="nf-title">{who} לא ניתן להוריד סרטון</h4>
        <p className="nf-text">ניתן לשלוח למייל ולצפות משם.</p>
        {mail.s === "sent" && (
          <p className="nf-text" role="status">
            הקישור נשלח{mail.email ? " אל " : ""}
            {mail.email && <bdi dir="ltr">{mail.email}</bdi>}
          </p>
        )}
        {mail.s === "error" && <p className="nf-text">השליחה נכשלה, נסי שוב בעוד רגע.</p>}
        <div className="nf-actions">
          {mailUrl && mail.s !== "sent" && (
            <button type="button" className="nf-btn nf-btn-main" onClick={send} disabled={mail.s === "sending"}>
              <Mail className="inline h-5 w-5 align-[-3px]" strokeWidth={1.75} aria-hidden /> {mail.s === "sending" ? "שולחת…" : "שליחה למייל"}
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
