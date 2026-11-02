import { School, Sprout, Flame, type LucideIcon } from "lucide-react";
import type { SichaSeminar } from "@/db/schema";

/** איורי קו (שחור/לבן, לא צבעוניים) לסוגי הסמינר — במקום אימוג'י */
const ICONS: Record<SichaSeminar, LucideIcon> = {
  mainstream: School,
  kiruv: Sprout,
  charedi_modern: Flame,
};

export function SeminarIcon({ type, className = "h-4 w-4" }: { type: SichaSeminar; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}
