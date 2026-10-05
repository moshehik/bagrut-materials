import Link from "next/link";
import { Download, Lock, LogIn, Crown, ShoppingBag, Sparkles, Eye, PauseCircle, Gift, Fingerprint } from "lucide-react";
import type { Material } from "@/db/schema";
import { AddToCartButton } from "@/components/add-to-cart-button";
import type { Entitlement } from "@/lib/data";
import { FreeTrialDownload } from "@/components/free-trial-download";
import type { FreeTrialState } from "@/lib/free-trial";
import { MATERIAL_KINDS, PREMIUM_KINDS, formatPrice } from "@/lib/constants";

type Props = {
  material: Material;
  entitlement: Entitlement;
  loggedIn: boolean;
  /** הנתיב הנוכחי – לחזרה אחרי התחברות */
  currentPath?: string;
  /** כמה פעמים המשתמשת הנוכחית הורידה את הקובץ הזה בעצמה */
  myDownloadCount?: number;
  /** מצב ההורדה החינמית האחת של המשתמשת (ר' src/lib/free-trial.ts) */
  freeTrial?: FreeTrialState;
};

/** נקודות נצנצים שיוצאות מכפתור ההורדה במעבר עכבר */
function DownloadSparkles() {
  return (
    <span className="btn-download-sparkles" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="sparkle" />
      ))}
    </span>
  );
}

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

export function MaterialCard({
  material: m,
  entitlement,
  loggedIn,
  currentPath = "/subjects",
  myDownloadCount = 0,
  freeTrial = "off",
}: Props) {
  const kind = MATERIAL_KINDS[m.kind] ?? MATERIAL_KINDS.other;
  const isPremium = m.premiumOnly || m.access === "premium" || PREMIUM_KINDS.includes(m.kind);
  const ft = fileType(m);
  const size = formatSize(m.size);

  return (
    <article id={`material-${m.id}`} className="card card-hover relative flex h-full flex-col p-5 scroll-mt-24">
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
        {m.access === "premium" && !isPremium && <span className="chip bg-pink-soft text-pink">פרימיום</span>}
        {!m.allowDownload && (
          <span className="chip bg-gray-100 text-gray-700">
            <Eye className="h-3 w-3" aria-hidden /> צפייה בלבד
          </span>
        )}
        {m.status !== "active" && <span className="chip bg-red-100 text-red-700">מושהה</span>}
        {m.downloads > 0 && (
          <span className="text-muted ms-auto">{m.downloads.toLocaleString("he-IL")} הורדות</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 pt-4">
        <Actions m={m} entitlement={entitlement} loggedIn={loggedIn} currentPath={currentPath} freeTrial={freeTrial} />
        {m.allowPreview && !entitlement.ok && (
          <a
            href={`/api/preview/${m.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost text-sm py-2"
            title="עמוד ראשון בלבד, ללא רכישה"
          >
            <Eye className="h-4 w-4" aria-hidden /> תצוגה מקדימה
          </a>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
        <Fingerprint className="h-3.5 w-3.5 shrink-0" aria-hidden />
        הדף שלך נשאר שלך
        {myDownloadCount > 0 && (
          <span>· הורדת קובץ זה {myDownloadCount.toLocaleString("he-IL")} פעמים</span>
        )}
      </p>
    </article>
  );
}

export function Actions({
  m,
  entitlement,
  currentPath,
  freeTrial = "off",
}: {
  m: Material;
  entitlement: Entitlement;
  loggedIn: boolean;
  currentPath: string;
  freeTrial?: FreeTrialState;
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
                : "";
    if (!m.allowDownload && entitlement.via !== "admin") {
      return (
        <>
          <a
            href={`/api/preview/${m.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-oak text-sm py-2"
            title="צפייה באתר בלבד – לא ניתן להורדה"
          >
            <Eye className="h-4 w-4" aria-hidden /> צפייה
          </a>
          {viaLabel && <span className="text-xs text-muted">{viaLabel}</span>}
        </>
      );
    }
    return (
      <>
        <a
          href={`/api/download/${m.id}`}
          className="btn btn-download text-sm py-2"
          title="הדף שלך נשאר שלך"
        >
          <Download className="h-4 w-4" aria-hidden /> הורדה
          <DownloadSparkles />
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
    case "login": {
      // קובץ חינמי: אורחת צריכה לראות שהוא פתוח לה (בכפתור בולט), כדי שתבין שההרשמה החינמית פותחת אותו
      const isFree = m.access === "free";
      return (
        <Link
          href={`/login?next=${encodeURIComponent(currentPath ?? "/subjects")}`}
          className={`btn text-sm py-2 ${isFree ? "btn-gold" : "btn-ghost"}`}
        >
          {isFree ? <Gift className="h-4 w-4" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
          {isFree ? "התחברי להורדה – חינם!" : "התחברי להורדה"}
        </Link>
      );
    }
    case "premium":
      return (
        <Link href="/checkout?premium=1" className="btn btn-gold text-sm py-2">
          <Sparkles className="h-4 w-4" aria-hidden /> פתיחה עם פרימיום
        </Link>
      );
    case "purchase":
      return (
        <>
          {m.allowDownload && (freeTrial === "available" || freeTrial === "unverified") && (
            <FreeTrialDownload materialId={m.id} title={m.title} state={freeTrial} className="btn btn-gold text-sm py-2">
              <Gift className="h-4 w-4" aria-hidden /> הורדה אחת חינם
            </FreeTrialDownload>
          )}
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
  }
}
