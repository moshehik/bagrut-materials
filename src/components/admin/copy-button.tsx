"use client";

import { useState } from "react";

/** מעתיקה ללוח. טקסט שמתחיל ב-"/" הופך לקישור מלא של האתר הנוכחי */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost text-xs py-1 px-2"
      onClick={async () => {
        const value = text.startsWith("/") ? `${window.location.origin}${text}` : text;
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          window.prompt("העתיקי ידנית:", value);
        }
      }}
    >
      {done ? "הועתק ✓" : label}
    </button>
  );
}
