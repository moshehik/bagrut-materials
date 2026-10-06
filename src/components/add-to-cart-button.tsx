"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShoppingCart, Check, Loader2 } from "lucide-react";
import { addToCart } from "@/lib/actions/cart";

export const CART_CHANGED_EVENT = "cart:changed";

/** מודיע ל-header (ולכל מאזין) שהעגלה השתנתה */
export function emitCartChanged(count?: number) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT, { detail: { count } }));
  }
}

type Props = {
  materialId?: number;
  categoryId?: number;
  /** המסלול היחיד שנכנס לעגלה הוא השנתי (המסלולים החודשיים הישנים הוסרו מהמכירה) */
  plan?: "yearly";
  label?: string;
  small?: boolean;
  className?: string;
};

/**
 * כפתור "הוסיפי לעגלה" – חומר בודד / תיקייה / מסלול.
 * אורחת → הפניה להתחברות עם חזרה לדף הנוכחי.
 */
export function AddToCartButton({ materialId, categoryId, plan, label, small, className }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "added" | "exists" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    start(async () => {
      const r = await addToCart({ materialId, categoryId, plan });
      if (!r.ok) {
        if (r.error === "login") {
          router.push(`/login?next=${encodeURIComponent(path || "/")}`);
          return;
        }
        setState("error");
        setError(r.error);
        return;
      }
      emitCartChanged(r.count);
      setState(r.existed ? "exists" : "added");
    });
  }

  const size = small ? "text-xs py-1.5 px-3" : "text-sm py-2";
  const done = state === "added" || state === "exists";

  return (
    <span className={`inline-flex items-center gap-2 flex-wrap ${className ?? ""}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending || done}
        aria-live="polite"
        className={`btn ${done ? "btn-ghost" : "btn-pink"} ${size} animate-pop`}
        title={done ? "בעגלה" : "הוסיפי לעגלה"}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : done ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <ShoppingCart className="h-4 w-4" />
        )}
        {done ? (state === "exists" ? "כבר בעגלה" : "נוסף לעגלה") : (label ?? "הוסיפי לעגלה")}
      </button>
      {done && (
        <Link
          href="/cart"
          className={`hover-move-x font-semibold text-blue-deep hover:underline ${small ? "text-xs" : "text-sm"}`}
        >
          לעגלה ←
        </Link>
      )}
      {error && <span className="text-xs text-[#9d4a2a]">{error}</span>}
    </span>
  );
}
