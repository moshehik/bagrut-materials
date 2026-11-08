import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Ruler } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getFillLinePercent } from "@/lib/user-prefs";
import { AccountTitle, Panel } from "@/components/account-ui";
import { FillLineForm } from "@/components/personalize-forms";

export const metadata: Metadata = { title: "התאמה אישית" };
export const dynamic = "force-dynamic";

/** התאמה אישית של הקבצים שהמורה מורידה. כל הגדרה כאן חלונית נפרדת (Panel) – ההגדרות הבאות יתווספו כחלוניות נוספות. */
export default async function AccountPersonalizePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/personalize");

  const fillLinePercent = await getFillLinePercent(user.id);

  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle
        title="התאמה אישית"
        subtitle="כאן מתאימים את הקבצים שאת מורידה לצורך שלך. ההגדרות חלות אוטומטית על כל הורדה."
        back
      />

      <Panel id="fill-lines-h" title="אורך קווי המילוי" icon={Ruler}>
        <FillLineForm initialPercent={fillLinePercent} />
      </Panel>
    </div>
  );
}
