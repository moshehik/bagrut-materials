import type { Metadata } from "next";
import { Ticket } from "lucide-react";

export const metadata: Metadata = { title: "קופונים זמינים" };

export default function CouponsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-20">
      <div className="animate-fade-up text-center">
        <span className="chip bg-gold-soft text-[#8a6500] mx-auto">
          <Ticket className="h-3.5 w-3.5" aria-hidden /> קופונים
        </span>
        <h1 className="font-display mt-3 text-3xl sm:text-4xl font-black">קופונים זמינים</h1>
        <p className="text-muted mt-3 leading-relaxed">
          בקרוב יופיעו כאן קופונים והטבות זמינות. חזרו לבדוק בהמשך!
        </p>
      </div>
    </div>
  );
}
