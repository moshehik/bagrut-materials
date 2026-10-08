import Link from "next/link";
import { ChevronLeft, Home } from "lucide-react";
import type { Category } from "@/db/schema";
import { chainToHref } from "@/lib/data";

export function Breadcrumbs({ chain }: { chain: Category[] }) {
  const items: { label: string; href: string; icon?: boolean }[] = [
    { label: "בית", href: "/", icon: true },
    { label: "המקצועות", href: "/subjects" },
    ...chain.map((c, i) => ({ label: c.title, href: chainToHref(chain.slice(0, i + 1)) })),
  ];

  return (
    <nav aria-label="מיקום באתר" className="crumbs">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={it.href} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="crumb-here">
                  {it.label}
                </span>
              ) : (
                <Link href={it.href} className="crumb-link">
                  {it.icon && <Home className="h-4 w-4" aria-hidden />}
                  {it.label}
                </Link>
              )}
              {!last && <ChevronLeft className="crumb-sep h-4 w-4" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
