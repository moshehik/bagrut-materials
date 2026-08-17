import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = { title: "ניהול האתר" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <div className="card p-10">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="font-display text-3xl font-bold mb-2">אין הרשאה</h1>
          <p className="text-muted">אזור זה מיועד למנהלת האתר בלבד.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <div className="wood rounded-2xl text-white px-6 py-5 mb-6 shadow-soft flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs opacity-80">אזור הניהול</p>
          <h1 className="font-display text-2xl font-bold">שלום, {user.name}</h1>
        </div>
        <span className="chip bg-white/20 text-white ms-auto">מנהלת</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] items-start">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
