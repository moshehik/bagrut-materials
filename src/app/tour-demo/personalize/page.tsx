import type { Metadata } from "next";
import { Ruler } from "lucide-react";
import { AccountMenu, AccountTitle, Panel } from "@/components/account-ui";
import { FillLineForm } from "@/components/personalize-forms";

export const metadata: Metadata = { title: "דוגמה להתאמה אישית", robots: { index: false, follow: false } };

/**
 * דוגמה ציבורית לחלון "התאמה אישית" לצורך הסיור באתר: אותם רכיבים בדיוק כמו באזור האישי האמיתי
 * (/account ו-/account/personalize, שדורשים התחברות), אבל בלי שמירה אמיתית.
 */
export default function TourDemoPersonalizePage() {
  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle
        title="האזור האישי"
        subtitle="דוגמה: כך נראה האזור האישי שלך אחרי ההרשמה, עם החלון ״התאמה אישית״."
      />
      <AccountMenu />
      <Panel id="fill-lines-h" title="אורך קווי המילוי" icon={Ruler}>
        <FillLineForm initialPercent={150} demo />
      </Panel>
    </div>
  );
}
