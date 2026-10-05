import { requireAdminPage } from "@/lib/session";
import Link from "next/link";
import { ForumReportsSection } from "@/components/admin/forum-reports-section";
import { PendingFixesSection } from "@/components/admin/pending-fixes-section";

export const dynamic = "force-dynamic";

/** הודעות שנשלחו למנהלת: דיווחים על תוכן לא הולם בפורום + בקשות תיקון לקבצים */
export default async function AdminInboxPage() {
  await requireAdminPage();
  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl font-bold">הודעות שנשלחו למנהלת</h2>

      <ForumReportsSection showEmpty />

      <div className="space-y-2">
        <PendingFixesSection title="בקשות תיקון" />
        <Link href="/admin/fixes" className="text-sm text-blue-deep hover:underline">
          לכל התיקונים (מפורסמים, שולבו, נדחו)
        </Link>
      </div>
    </div>
  );
}
