import { DriveExplorer } from "@/components/admin/drive-explorer";

export const dynamic = "force-dynamic";

export const metadata = { title: "סייר קבצי דרייב" };

export default function AdminDrivePage() {
  return <DriveExplorer />;
}
