import Link from "next/link";
import { SITE_MOTTO } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-24 bg-sea2 text-white rounded-t-[40px]">
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-12 pb-8 grid gap-10 md:grid-cols-4 text-[15px]">
        <div className="md:col-span-2">
          <div className="font-hand text-[30px] leading-none">
            לו״ז <span className="text-sun">העניין</span>
          </div>
          <p className="mt-3 text-white/85 max-w-md leading-relaxed">
            {SITE_MOTTO}. שיעורים מוכנים למורות במחוז החרדי – דף לתלמידה, דף למורה
            ומצגת מלווה לכל פרק – כדי שהזמן שלך יישאר לדברים שרק מורה יכולה לתת.
          </p>
        </div>
        <div>
          <div className="font-display text-lg mb-3 text-sun">ניווט</div>
          <ul className="space-y-1.5 text-white/90">
            <li><Link href="/subjects" className="link-draw hover:text-sun">המקצועות</Link></li>
            <li><Link href="/map" className="link-draw hover:text-sun">מפת הבגרות</Link></li>
            <li><Link href="/pricing" className="link-draw hover:text-sun">מסלולים ומחירים</Link></li>
            <li><Link href="/forum" className="link-draw hover:text-sun">פורום מורות</Link></li>
            <li><Link href="/sell" className="link-draw hover:text-sun">מכירת חומרים לאתר</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-display text-lg mb-3 text-sun">מידע</div>
          <ul className="space-y-1.5 text-white/90">
            <li><Link href="/terms" className="link-draw hover:text-sun">תנאי שימוש וזכויות יוצרים</Link></li>
            <li><Link href="/privacy" className="link-draw hover:text-sun">מדיניות פרטיות</Link></li>
            <li><Link href="/accessibility" className="link-draw hover:text-sun">הצהרת נגישות</Link></li>
            <li><Link href="/contact" className="link-draw hover:text-sun">צרי קשר</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15 text-center text-xs text-white/80 py-4 px-4">
        © {new Date().getFullYear()} לו״ז העניין · {SITE_MOTTO} · כל קובץ מוטבע במספר אישי של המורידה
      </div>
    </footer>
  );
}
