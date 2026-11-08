import type { Metadata } from "next";

// דף שלא צריך להופיע בחיפוש גוגל. נשאר פתוח לסריקה בכוונה (ר' robots.ts): גוגל חייבת לסרוק כדי לראות את ה-noindex
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return children;
}
