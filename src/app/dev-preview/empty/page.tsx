import { notFound } from "next/navigation";
import { EmptySheet } from "@/components/empty-sheet";

/** תצוגה מקדימה של הודעת "אין מקצועות במאגר" – זמין רק בפיתוח מקומי */
export default function EmptyPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EmptySheet />;
}
