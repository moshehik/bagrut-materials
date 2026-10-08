import { notFound } from "next/navigation";
import { ErrorSheet } from "@/components/error-sheet";

/** תצוגה מקדימה של דף התקלה – זמין רק בפיתוח מקומי */
export default function ErrorPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ErrorSheet />;
}
