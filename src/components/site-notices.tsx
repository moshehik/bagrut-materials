import Link from "next/link";
import { Megaphone, Wrench } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";

/**
 * עוטף את תוכן האתר:
 * - מצב תחזוקה פעיל + המשתמשת אינה מנהלת → כרטיס תחזוקה במקום האתר.
 * - אחרת: פס הודעה (announcement) אם קיים, ואז התוכן.
 */
export async function SiteNotices({ children }: { children: React.ReactNode }) {
  const [settings, user] = await Promise.all([
    getSettings(),
    getCurrentUser().catch(() => null),
  ]);
  const isAdmin = user?.role === "admin";
  const maintenance = settings.maintenance_mode === "true";
  const announcement = settings.announcement.trim();

  if (maintenance && !isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <div className="card p-10 animate-pop">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-oak-soft text-oak-deep animate-float">
            <Wrench className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="font-display text-3xl font-bold mt-5">{settings.site_name}</h1>
          <p className="mt-3 text-lg text-muted whitespace-pre-line leading-relaxed">
            {settings.maintenance_message || "האתר בתחזוקה קצרה, נחזור בקרוב."}
          </p>
          {!user && (
            <p className="mt-6 text-sm text-muted">
              מנהלת?{" "}
              <Link href="/login?next=/admin" className="text-blue-deep underline">
                התחברי כאן
              </Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {maintenance && isAdmin && (
        <div className="bg-red-600 text-white text-sm text-center px-4 py-2">
          <Wrench className="inline h-4 w-4 me-1 -mt-0.5" aria-hidden />
          מצב תחזוקה פעיל – המשתמשות רואות רק את הודעת התחזוקה.{" "}
          <Link href="/admin/settings" className="underline font-semibold">
            לכיבוי
          </Link>
        </div>
      )}
      {announcement && (
        <div
          role="status"
          className="bg-gradient-to-l from-gold-soft via-white to-pink-soft text-foreground text-sm text-center px-4 py-2 border-b border-black/5"
        >
          <Megaphone className="inline h-4 w-4 me-1 -mt-0.5 text-oak-deep" aria-hidden />
          <span className="whitespace-pre-line">{announcement}</span>
        </div>
      )}
      {children}
    </>
  );
}
