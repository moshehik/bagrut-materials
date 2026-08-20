import type { SVGProps } from "react";
import s from "./folder-icon.module.css";

/** אייקון תיקייה גנרי — קו דק שחור, מוצג כשלתיקייה/מקצוע אין בית או אייקון משלה */
export function IconFolder({ className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${s.folder} ${className ?? ""}`}
      {...rest}
    >
      <path className={s.paper} d="M17 17V10h9l5 5v3" />
      <path d="M26 10v5h5" />
      <path d="M5 16a2 2 0 0 1 2-2h9l4 4h19a2 2 0 0 1 2 2v3H5z" />
      <path
        className={s.front}
        d="M4 21h40l-3.5 16.5a3 3 0 0 1-3 2.5H10.5a3 3 0 0 1-3-2.5z"
      />
    </svg>
  );
}
