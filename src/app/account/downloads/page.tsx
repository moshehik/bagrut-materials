import { redirect } from "next/navigation";

/** ההורדות של הלקוחה מוצגות רק בלוח שנה עברי (עם סינון לפי סוג, ולחיצה על יום מפרטת) – קישורים ישנים מגיעים לשם */
export default function AccountDownloadsPage() {
  redirect("/account/downloads/calendar");
}
