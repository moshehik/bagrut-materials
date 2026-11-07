"use client";

import { Fingerprint, Mail } from "lucide-react";

/**
 * אייקוני lucide שחוזרים בכל כרטיס חומר (טביעת אצבע, מעטפה). כרכיבי לקוח ב-RSC עוברים רק שם ו-props,
 * ולא נתוני הנתיב של האייקון (כשהם מוצגים מרכיב שרת, הנתיב נכנס לנתוני ה-RSC בכל כרטיס – כ-0.7KB × כל הכרטיסים).
 */
export function PrintIcon({ className }: { className?: string }) {
  return <Fingerprint className={className} strokeWidth={1.4} aria-hidden />;
}

export function MailIcon({ className }: { className?: string }) {
  return <Mail className={className} strokeWidth={1.3} />;
}
