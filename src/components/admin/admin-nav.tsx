"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderTree,
  FileStack,
  Users,
  HandCoins,
  MessagesSquare,
  Mail,
  Activity,
  Download,
  Radio,
  BarChart3,
  ScrollText,
  Wallet,
  CreditCard,
  Settings,
} from "lucide-react";

const ITEMS = [
  { href: "/admin", label: "לוח בקרה", icon: LayoutDashboard, exact: true },
  { href: "/admin/categories", label: "עץ הקטגוריות", icon: FolderTree },
  { href: "/admin/materials", label: "חומרים", icon: FileStack },
  { href: "/admin/users", label: "משתמשות", icon: Users },
  { href: "/admin/offers", label: "הצעות מכירה", icon: HandCoins },
  { href: "/admin/forum", label: "פורום", icon: MessagesSquare },
  { href: "/admin/mail", label: "מיילים", icon: Mail },
  { href: "/admin/online", label: "מחוברות כעת", icon: Radio },
  { href: "/admin/activity", label: "פעילות וגלישה", icon: Activity },
  { href: "/admin/downloads", label: "היסטוריית הורדות", icon: Download },
  { href: "/admin/stats", label: "סטטיסטיקות", icon: BarChart3 },
  { href: "/admin/logs", label: "לוג פעולות", icon: ScrollText },
  { href: "/admin/finance", label: "כספים", icon: Wallet },
  { href: "/admin/subscriptions", label: "מנויים", icon: CreditCard },
  { href: "/admin/settings", label: "הגדרות", icon: Settings },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="ניווט ניהול" className="card p-2 lg:sticky lg:top-24">
      <ul className="flex lg:flex-col gap-1 overflow-x-auto">
        {ITEMS.map((it) => {
          const active = it.exact ? path === it.href : path.startsWith(it.href);
          const Icon = it.icon;
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-oak-soft text-oak-deep"
                    : "text-foreground/80 hover:bg-oak-soft/60 hover:text-oak-deep"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
