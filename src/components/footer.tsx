import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-blue/10 bg-white/60 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div className="md:col-span-2">
          <div className="font-display text-2xl font-bold">{SITE_NAME}</div>
          <p className="mt-2 text-muted max-w-md leading-relaxed">
            מאגר שיעורים מוכנים למורות במחוז החרדי: דפי שכפול לתלמידה ולמורה, מצגות,
            שאלות מבגרויות קודמות וטיפים – מסודר לפי מקצוע, יחידות, פנימי/חיצוני ופרקים.
          </p>
        </div>
        <div>
          <div className="font-semibold mb-2">ניווט</div>
          <ul className="space-y-1 text-muted">
            <li><Link href="/subjects" className="hover:text-blue-deep">המקצועות</Link></li>
            <li><Link href="/map" className="hover:text-blue-deep">מפת הבגרות</Link></li>
            <li><Link href="/pricing" className="hover:text-blue-deep">מסלולים ומחירים</Link></li>
            <li><Link href="/forum" className="hover:text-blue-deep">פורום</Link></li>
            <li><Link href="/sell" className="hover:text-blue-deep">מכירת חומרים לאתר</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-2">מידע</div>
          <ul className="space-y-1 text-muted">
            <li><Link href="/terms" className="hover:text-blue-deep">תנאי שימוש וזכויות יוצרים</Link></li>
            <li><Link href="/accessibility" className="hover:text-blue-deep">הצהרת נגישות</Link></li>
            <li><Link href="/contact" className="hover:text-blue-deep">צרי קשר</Link></li>
          </ul>
        </div>
      </div>
      <div className="wood text-white/95 text-center text-xs py-3">
        © {new Date().getFullYear()} {SITE_NAME} · כל הזכויות שמורות · כל קובץ מוטבע במספר אישי של המורידה
      </div>
    </footer>
  );
}
