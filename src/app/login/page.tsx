import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogIn, ShieldCheck, Download, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getBool } from "@/lib/settings";
import { googleConfigured } from "@/lib/google-oauth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "התחברות" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; suspended?: string; reset?: string; verified?: string }>;
}) {
  const { next, error, suspended, reset } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  const user = await getCurrentUser();
  if (user) redirect(safeNext ?? "/account");

  const googleEnabled = googleConfigured() && (await getBool("google_login_enabled"));
  const urlError = suspended === "1" ? "suspended" : error || undefined;
  const notice = reset === "1" ? "הסיסמה עודכנה – אפשר להתחבר עם הסיסמה החדשה." : undefined;

  return (
    <AuthShell
      icon={<LogIn className="h-6 w-6" />}
      title="ברוכה השבה, מורה"
      subtitle="התחברי כדי להוריד חומרים ולנהל את המנוי שלך"
      aside={
        <div className="space-y-4">
          <h2 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
            כל השיעורים המוכנים,
            <br />
            <span className="gold-text">במקום אחד</span>
          </h2>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3 items-start">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-blue-soft text-blue-deep shrink-0">
                <Download className="h-4 w-4" />
              </span>
              <span>
                <b>הורדה מיידית</b> של דפי שכפול, מצגות ושאלות מבגרויות קודמות.
              </span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-pink-soft text-pink shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span>
                <b>מספר אישי</b> מוטבע על כל קובץ – החומרים שלך נשארים שלך.
              </span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-gold-soft text-[#8a6500] shrink-0">
                <Sparkles className="h-4 w-4" />
              </span>
              <span>
                <b>פרימיום</b> פותח פורום מורות, טיפים למסירה ורעיונות לשיעור.
              </span>
            </li>
          </ul>
        </div>
      }
    >
      <LoginForm next={safeNext} googleEnabled={googleEnabled} urlError={urlError} notice={notice} />
    </AuthShell>
  );
}
