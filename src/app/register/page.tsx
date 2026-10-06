import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getBool } from "@/lib/settings";
import { googleConfigured } from "@/lib/google-oauth";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "הצטרפות" };
export const dynamic = "force-dynamic";

const PERKS = [
  "גישה לכל עץ המקצועות והפרקים של הבגרות במחוז החרדי",
  "דפי שכפול לתלמידה ולמורה, מצגות ושאלות מבגרויות קודמות",
  "מנוי שנתי למקצוע – ואפשר להרחיב עד 3 מקצועות באותו מחיר",
  "מספר אישי ייחודי לשמירה על זכויות היוצרים",
];

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const user = await getCurrentUser();
  if (user) redirect(safeNext ?? "/");
  const googleEnabled = googleConfigured() && (await getBool("google_login_enabled"));

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="gate-title animate-fade-up flex flex-col items-center justify-center gap-y-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-black.png" alt="לו״ז העניין" className="w-52 sm:w-64" />
        <div>
          <h1 className="text-4xl md:text-5xl">הצטרפי ללו״ז העניין</h1>
          <p className="mt-2 max-w-md">ההרשמה חינמית ולוקחת פחות מדקה.</p>
        </div>
      </div>

      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby="perks-h">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-card">
          <h2 id="perks-h" className="mb-2 text-2xl">מה מחכה לך בפנים?</h2>
          <ul className="space-y-1">
            {PERKS.map((p) => (
              <li key={p} className="flex gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/nut-handle.png" alt="" aria-hidden className="mt-0.5 h-6 w-6 shrink-0 object-contain" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-8">
          <RegisterForm next={safeNext} googleEnabled={googleEnabled} />
        </div>
      </section>
    </div>
  );
}
