import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { forumReports, materialFixes } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = { title: "ניהול האתר" };
export const dynamic = "force-dynamic";

async function safeCount(p: Promise<{ n: number }[]>): Promise<number> {
  try {
    const [r] = await p;
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

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

  // התראות פתוחות למנהלת – באנר בראש כל עמודי הניהול ומספר ליד הפריטים בתפריט
  const [openReports, pendingFixes] = await Promise.all([
    safeCount(db.select({ n: count() }).from(forumReports).where(eq(forumReports.status, "open"))),
    safeCount(db.select({ n: count() }).from(materialFixes).where(eq(materialFixes.status, "pending"))),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      {openReports > 0 && (
        <Link
          href="/admin/forum"
          role="alert"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-red-300 bg-red-50 px-5 py-3 text-red-800 shadow-soft transition-colors hover:bg-red-100"
        >
          <BellRing className="h-5 w-5 shrink-0" aria-hidden />
          <span className="font-bold">
            {openReports === 1
              ? "יש דיווח חדש על תוכן לא הולם בפורום"
              : `יש ${openReports} דיווחים חדשים על תוכן לא הולם בפורום`}
          </span>
          <span className="ms-auto text-sm underline">לטיפול ←</span>
        </Link>
      )}
      <div className="wood rounded-2xl text-white px-6 py-5 mb-6 shadow-soft flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs opacity-80">אזור הניהול</p>
          <h1 className="font-display text-2xl font-bold">שלום, {user.name}</h1>
        </div>
        <span className="chip bg-white/20 text-white ms-auto">מנהלת</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] items-start">
        <AdminNav
          badges={{
            "/admin/inbox": openReports + pendingFixes,
            "/admin/forum": openReports,
            "/admin/fixes": pendingFixes,
          }}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
