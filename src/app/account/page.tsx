import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { AccountMenu, AccountTitle, Notice } from "@/components/account-ui";

export const metadata: Metadata = { title: "האזור האישי" };
export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{
    purchased?: string;
    verified?: string;
    limit?: string;
    emailchange?: string;
  }>;
}) {
  const { purchased, verified, limit, emailchange } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle title={`שלום, ${user.name}`} eyebrow />

      {limit && (
        <Notice icon={XCircle} alert>
          {limit === "period"
            ? "הגעת למכסת ההורדות לתקופה של 30 ימים. ההורדות מתפנות בהדרגה – נסי שוב בעוד כמה ימים או פני למנהלת האתר."
            : "הגעת למכסת ההורדות היומית. נסי שוב מחר או פני למנהלת האתר."}
        </Notice>
      )}
      <VerifyEmailBanner
        verified={user.emailVerified}
        email={user.email}
        justVerified={verified === "1"}
        failed={verified === "0"}
      />
      {purchased && (
        <Notice icon={CheckCircle2}>
          <b className="font-normal text-white">ההזמנה נרשמה בהצלחה!</b> אפשר להתחיל להוריד. הרכישה מופיעה ב&quot;רכישות
          ומנויים&quot;.
        </Notice>
      )}
      {emailchange === "1" && <Notice icon={CheckCircle2}>כתובת המייל עודכנה בהצלחה.</Notice>}
      {emailchange === "0" && (
        <Notice icon={XCircle} alert>
          אימות המייל נכשל – הקישור אינו תקף או שפג תוקפו. אפשר לנסות שוב.
        </Notice>
      )}

      <AccountMenu />
    </div>
  );
}
