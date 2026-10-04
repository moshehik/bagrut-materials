import Image from "next/image";
import { Eye, Fingerprint, PauseCircle } from "lucide-react";
import type { Material } from "@/db/schema";
import type { Entitlement } from "@/lib/data";
import { CARD_STYLES, LABEL_SIZES, type CardType } from "@/lib/material-card-types";
import { FIX_TIPS, FixRequestButton, FixViewer, type CardFix } from "@/components/material-fixes";

type Props = {
  material: Material;
  entitlement: Entitlement;
  type: CardType;
  /** שם הפרק / היחידה (שם התיקייה) – מופיע בכותרת אחרי המקף, בגופן גברת לוין */
  folderTitle: string;
  currentPath: string;
  /** רכישת כל התיקייה (15 ש"ח) – לשם מובילה ההורדה למי שעוד לא רכשה */
  bundleHref: string;
  myDownloadCount?: number;
  /** תיקונים מפורסמים לקובץ (ר' src/lib/fixes.ts) – מציגים אגוזי "קובץ מתוקן" ו"בחירת שינויים" */
  fixes?: CardFix[];
};

/** לאן מובילה לחיצה על האגוז האדום – הורדה למי שמורשית, אחרת הצעד החסר (התחברות / רכישת התיקייה) */
function downloadTarget(m: Material, ent: Entitlement, currentPath: string, bundleHref: string): string | null {
  if (ent.ok) return m.allowDownload || ent.via === "admin" ? `/api/download/${m.id}` : null;
  switch (ent.reason) {
    case "login":
      return `/login?next=${encodeURIComponent(currentPath)}`;
    case "premium":
    case "purchase":
      return bundleHref;
    case "quota":
    case "tier":
      return "/pricing";
    default:
      return null; // suspended
  }
}

/** הכרטיסייה מבפנים: כותרת כהה עם דמות ושם הסוג (בכתב מהעיצוב) + שם הפרק, וגוף צבעוני עם הורדה באגוז */
export function MaterialTypeCard({
  material: m,
  entitlement,
  type,
  folderTitle,
  currentPath,
  bundleHref,
  myDownloadCount = 0,
  fixes = [],
}: Props) {
  const s = CARD_STYLES[type];
  const target = downloadTarget(m, entitlement, currentPath, bundleHref);
  const viewOnly = entitlement.ok && !m.allowDownload && entitlement.via !== "admin";
  const size = LABEL_SIZES[type];
  // אגוזי התיקונים רק למי שמורשית להוריד, ורק בקובץ Word (שם התיקונים מוחלים)
  const canFix = entitlement.ok && !viewOnly && !!target && /\.docx$/i.test(m.fileName) && fixes.length > 0;
  // בלי גישה לקובץ: "שינויים בקובץ" מוביל לאותו צעד חסר כמו ההורדה (התחברות / רכישה)
  const lockedHref = entitlement.ok ? null : target;
  // צפייה בקובץ באתר – רק למי שמורשית לקובץ (שילמה / מנוי / חינם למחוברת / מנהלת)
  const canView = entitlement.ok && !viewOnly;

  return (
    <article
      id={`material-${m.id}`}
      className="mtc relative scroll-mt-24"
      style={{ "--mtc-body": s.body, "--mtc-strip": s.strip } as React.CSSProperties}
    >
      <header className="mtc-head">
        <Image
          src={`/images/mat-cards/art4/${s.art}.webp`}
          alt=""
          width={120}
          height={120}
          className={`mtc-art ${s.artWide ? "mtc-art-wide" : ""}`}
          aria-hidden
        />
        <h3 className="mtc-title" aria-label={`${s.label} - ${folderTitle}`}>
          {/* שם הסוג: הכתב המדויק מהעיצוב, כתמונה שקופה */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/images/mat-cards/label-${type}.webp`}
            alt=""
            width={size[0]}
            height={size[1]}
            className="mtc-label"
            style={{ "--w": size[0] } as React.CSSProperties}
            aria-hidden
          />
          <span className="mtc-chapter" aria-hidden>
            - {folderTitle}
          </span>
        </h3>
      </header>

      <div className="mtc-body">
        <div className={`mtc-print ${s.lightPrint ? "mtc-print-light" : ""}`}>
          <Fingerprint className="mtc-print-icon" strokeWidth={1.4} aria-hidden />
          <span>הפרטים שלך על הקובץ</span>
        </div>

        {viewOnly ? (
          <a href={`/api/preview/${m.id}`} target="_blank" rel="noopener noreferrer" className="mtc-download">
            <Eye className="mtc-nut" aria-hidden />
            <span>לצפייה</span>
          </a>
        ) : target ? (
          <a
            href={target}
            className="mtc-download"
            title={entitlement.ok ? "הקובץ יוטבע במספר האישי שלך" : "כדי להוריד צריך קודם להשלים את השלב הבא"}
            aria-label={`הורדת ${s.label}`}
          >
            <Image src="/images/mat-cards/nut-download.webp" alt="" width={84} height={67} className="mtc-nut" aria-hidden />
            <span>להורדה</span>
          </a>
        ) : (
          <span className="mtc-download mtc-disabled">
            <PauseCircle className="mtc-nut" aria-hidden />
            <span>מושהה</span>
          </span>
        )}

        {/* מי שלא שילמה: האגוז מוביל לאותו צעד חסר כמו ההורדה (התחברות / רכישה); הצפייה עצמה נאכפת בשרת */}
        {(canView || (!viewOnly && target)) && (
          <a
            href={canView ? `/api/preview/${m.id}` : target!}
            {...(canView ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="mtc-download"
            data-tip={canView ? "לצפייה בקובץ באתר, בלי להוריד" : "לצפייה בקובץ צריך קודם להשלים את השלב הבא"}
            aria-label={`צפייה ב${s.label} באתר`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/nuts/one-03.webp" alt="" width={40} height={40} className="mtc-nut" aria-hidden />
            <span>לצפייה</span>
          </a>
        )}
      </div>

      {/* הריבוע התחתון: עריכת שינויים תמיד; ואם כבר נעשו תיקונים – גם צפייה בהם והורדת הקובץ המתוקן */}
      <div className="mtc-lower">
        <div className="mtc-tools">
          <FixRequestButton
            materialId={m.id}
            materialTitle={`${s.label} - ${folderTitle}`}
            lockedHref={lockedHref}
            nutSrc="/images/nuts/one-03.webp"
          />
          {canFix && (
            <>
              <FixViewer materialId={m.id} fixes={fixes} downloadHref={target!} nutSrc="/images/nuts/one-06.webp" />
              <a href={`${target}?fixes=all`} className="mtc-row" data-tip={FIX_TIPS.download}>
                <Image src="/images/mat-cards/nut-download.webp" alt="" width={84} height={67} className="mtc-rownut" aria-hidden />
                <span>להורדת הקובץ המתוקן</span>
              </a>
            </>
          )}
        </div>
      </div>

      {(m.status !== "active" || myDownloadCount > 0 || (m.allowPreview && !entitlement.ok)) && (
        <div className="mtc-foot">
          {m.status !== "active" && (
            <span className="inline-flex items-center gap-1 text-red-700">
              <PauseCircle className="h-3.5 w-3.5" aria-hidden /> {m.status === "draft" ? "טיוטה – מוצג רק למנהלת" : "מושהה"}
            </span>
          )}
          {m.allowPreview && !entitlement.ok && (
            <a href={`/api/preview/${m.id}`} target="_blank" rel="noopener noreferrer" className="underline">
              תצוגה מקדימה (עמוד ראשון)
            </a>
          )}
          {myDownloadCount > 0 && <span>הורדת קובץ זה {myDownloadCount.toLocaleString("he-IL")} פעמים</span>}
        </div>
      )}
    </article>
  );
}
