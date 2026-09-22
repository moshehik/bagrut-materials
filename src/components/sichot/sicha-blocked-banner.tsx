import { HeartHandshake } from "lucide-react";
import { SichaUploadForm } from "./sicha-upload-form";

/**
 * מוצג במקום רשימת השיחות למורה שהצטרפה למאגר ולא העלתה שיחה חדשה בזמן.
 * חסימה ממאגר השיחות בלבד — שאר האתר (הורדות בגרות וכו') ממשיך לעבוד רגיל.
 */
export function SichaBlockedBanner({ categoryId, path }: { categoryId: number; path: string }) {
  return (
    <div className="space-y-6">
      <div className="card p-6 md:p-8 text-center bg-gradient-to-br from-gold-soft/70 via-white to-blue-soft/40">
        <span className="grid h-14 w-14 mx-auto place-items-center rounded-full bg-white shadow-md">
          <HeartHandshake className="h-7 w-7 text-[#8a6500]" aria-hidden />
        </span>
        <h2 className="mt-3 font-display text-xl font-bold">התור להעלות שיחה חדשה כבר הגיע 💛</h2>
        <p className="mt-2 max-w-xl mx-auto text-sm leading-relaxed text-muted">
          כדי לשמור על מאגר חי לכולן, כל מורה מעלה שיחה חדשה מדי כמה שבועות. ברגע שתעלי שיחה
          חדשה, הגישה למאגר תיפתח לך מייד שוב — ותוכלי להמשיך ליהנות מהשיחות של כל המורות.
        </p>
      </div>
      <SichaUploadForm categoryId={categoryId} path={path} />
    </div>
  );
}
