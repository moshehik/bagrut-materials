import Link from "next/link";
import { Download, Lock, LogIn, Crown, ShoppingBag, Sparkles, Eye, PauseCircle, Gift } from "lucide-react";
import type { Material } from "@/db/schema";
import { AddToCartButton } from "@/components/add-to-cart-button";
import type { Entitlement } from "@/lib/data";
import { MATERIAL_KINDS, PREMIUM_KINDS, TIERS, formatPrice } from "@/lib/constants";

type Props = {
  material: Material;
  entitlement: Entitlement;
  loggedIn: boolean;
  /** הנתיב הנוכחי – לחזרה אחרי התחברות */
  currentPath?: string;
};

function fileType(m: Material): { label: string; className: string } {
  const name = m.fileName.toLowerCase();
  const mime = m.mime.toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf"))
    return { label: "PDF", className: "bg-pink-soft text-[#9d4a2a]" };
  if (mime.includes("presentation") || /\.pptx?$/.test(name))
    return { label: "PPTX", className: "bg-oak-soft text-oak-deep" };
  if (mime.includes("word") || /\.docx?$/.test(name))
    return { label: "DOCX", className: "bg-blue-soft text-blue-deep" };
  const ext = name.split(".").pop();
  return { label: (ext || "קובץ").toUpperCase(), className: "bg-gray-100 text-gray-700" };
}

function formatSize(bytes: number) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MaterialCard({ material: m, entitlement, loggedIn, currentPath = "/subjects" }: Props) {
  const kind = MATERIAL_KINDS[m.kind] ?? MATERIAL_KINDS.other;
  const isPremium = m.premiumOnly || m.access === "premium" || PREMIUM_KINDS.includes(m.kind);
  const ft = fileType(m);
  const size = formatSize(m.size);

  return (
    <article className="card card-hover relative flex h-full flex-col p-5">
      {isPremium && (
        <span className="absolute -top-2 left-4 chip btn-gold shadow-md text-[11px]">
          <Crown className="h-3 w-3" aria-hidden /> פרימיום
        </span>
      )}
      <div className="flex items-start gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-soft text-2xl"
          aria-hidden
        >
          {kind.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-blue-deep">{kind.label}</div>
          <h3 className="font-bold leading-snug">{m.title}</h3>
          {m.description && (
            <p className="mt-1 text-sm text-muted leading-relaxed line-clamp-3">{m.description}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`chip ${ft.className}`}>{ft.label}</span>
        {size && <span className="chip bg-gray-100 text-gray-600">{size}</span>}
        {m.access === "free" ? (
          <span className="chip bg-green-100 text-green-800">
            <Gift className="h-3 w-3" aria-hidden /> חינם
          </span>
        ) : (
          <span className="chip bg-gold-soft text-[#7a5b00]">{formatPrice(m.price)}</span>
        )}
        {m.access === "tier" && <span className="chip bg-blue-soft text-blue-deep">לפי רמה</span>}
        {m.access === "premium" && !isPremium && <span className="chip bg-pink-soft text-pink">פרימיום</span>}
        {!m.allowDownload && (
          <span className="chip bg-gray-100 text-gray-700">
            <Eye className="h-3 w-3" aria-hidden /> צפייה בלבד
          </span>
        )}
        {m.status !== "active" && <span className="chip bg-red-100 text-red-700">מושהה</span>}
        {m.minTier !== "none" && (
          <span
            className="chip"
            style={{ background: TIERS[m.minTier].color + "22", color: TIERS[m.minTier].color }}
            title="רמת פרימיום מינימלית"
          >
            {TIERS[m.minTier].icon} {TIERS[m.minTier].label}+
          </span>
        )}
        {m.downloads > 0 && (
          <span className="text-muted ms-auto">{m.downloads.toLocaleString("he-IL")} הורדות</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 pt-4">
        <Actions m={m} entitlement={entitlement} loggedIn={loggedIn} currentPath={currentPath} />
      </div>
    </article>
  );
}

function Actions({
  m,
  entitlement,
  currentPath,
}: {
  m: Material;
  entitlement: Entitlement;
  loggedIn: boolean;
  currentPath: string;
}) {
  if (entitlement.ok) {
    const viaLabel =
      entitlement.via === "admin"
        ? "גישת מנהלת"
        : entitlement.via === "single"
          ? "נרכש"
          : entitlement.via === "bundle"
            ? "כלול בתיקייה שרכשת"
            : entitlement.via === "subscription"
              ? "כלול במנוי שלך"
              : entitlement.via === "free"
                ? "חינם"
                : entitlement.via === "tier"
                  ? "כלול ברמת הפרימיום שלך"
                  : "";
    if (!m.allowDownload && entitlement.via !== "admin") {
      return (
        <>
          <span className="inline-flex items-center gap-1 text-sm text-muted font-medium">
            <Eye className="h-4 w-4" aria-hidden /> צפייה בלבד – לא ניתן להורדה
          </span>
          {viaLabel && <span className="text-xs text-muted">{viaLabel}</span>}
        </>
      );
    }
    return (
      <>
        <a
          href={`/api/download/${m.id}`}
          className={`btn text-sm py-2 ${entitlement.via === "free" ? "btn-oak" : "btn-primary"}`}
          title="הקובץ יוטבע במספר האישי שלך"
        >
          <Download className="h-4 w-4" aria-hidden /> הורדה
        </a>
        {viaLabel && <span className="text-xs text-muted">{viaLabel}</span>}
      </>
    );
  }

  switch (entitlement.reason) {
    case "suspended":
      return (
        <span className="inline-flex items-center gap-1 text-sm text-red-700 font-medium">
          <PauseCircle className="h-4 w-4" aria-hidden /> הדף מושהה זמנית
        </span>
      );
    case "login":
      return (
        <Link
          href={`/login?next=${encodeURIComponent(currentPath ?? "/subjects")}`}
          className="btn btn-ghost text-sm py-2"
        >
          <LogIn className="h-4 w-4" aria-hidden /> התחברי להורדה
        </Link>
      );
    case "premium":
      return (
        <Link href="/checkout?premium=1" className="btn btn-gold text-sm py-2">
          <Sparkles className="h-4 w-4" aria-hidden /> פתיחה עם פרימיום
        </Link>
      );
    case "purchase":
      return (
        <>
          <Link href={`/checkout?material=${m.id}`} className="btn btn-primary text-sm py-2">
            <ShoppingBag className="h-4 w-4" aria-hidden /> רכישה בודדת {formatPrice(m.price)}
          </Link>
          <AddToCartButton materialId={m.id} small />
          <Link href="/pricing" className="btn btn-ghost text-sm py-2">
            למנויים
          </Link>
        </>
      );
    case "quota":
      return (
        <>
          <span className="inline-flex items-center gap-1 text-sm text-pink font-medium">
            <Lock className="h-4 w-4" aria-hidden /> מכסת ההורדות החודשית נוצלה
          </span>
          <Link href="/pricing" className="btn btn-ghost text-sm py-2">
            להרחבת המנוי
          </Link>
        </>
      );
    case "tier":
      return (
        <>
          <span className="inline-flex items-center gap-1 text-sm text-oak-deep font-medium">
            <Lock className="h-4 w-4" aria-hidden /> נדרשת רמת פרימיום גבוהה יותר
          </span>
          <Link href="/pricing" className="btn btn-ghost text-sm py-2">
            לרמות הפרימיום
          </Link>
        </>
      );
  }
}
