import Link from "next/link";
import { FolderTree, Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <div className="relative animate-pop">
        <span className="font-display text-[7rem] font-black leading-none text-blue-soft select-none">
          404
        </span>
        <span className="absolute -top-2 right-1/2 translate-x-1/2 text-6xl animate-float">🔍</span>
      </div>
      <h1 className="font-display mt-2 text-3xl font-bold">הדף לא נמצא</h1>
      <p className="mt-2 max-w-md text-muted leading-relaxed">
        אולי הפרק עבר לתיקייה אחרת, או שהקישור לא מדויק. אפשר לחזור למקצועות ולמצוא אותו משם.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/subjects" className="btn btn-primary">
          <FolderTree className="h-4 w-4" aria-hidden /> למקצועות
        </Link>
        <Link href="/map" className="btn btn-ghost">
          <Search className="h-4 w-4" aria-hidden /> למפת הבגרות
        </Link>
        <Link href="/" className="btn btn-ghost">
          <Home className="h-4 w-4" aria-hidden /> לדף הבית
        </Link>
      </div>
    </div>
  );
}
