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
    <nav aria-label="מיקום באתר" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-muted">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={it.href} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="font-semibold text-foreground">
                  {it.label}
                </span>
              ) : (
                <Link
                  href={it.href}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-blue-soft hover:text-blue-deep transition-colors"
                >
                  {it.icon && <Home className="h-3.5 w-3.5" aria-hidden />}
                  {it.label}
                </Link>
              )}
              {!last && <ChevronLeft className="h-3.5 w-3.5 opacity-60" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
